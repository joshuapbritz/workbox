/*
  Copyright 2017 Google Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

const copyWorkboxLibraries = require('./lib/copy-workbox-libraries');
const generateSW = require('./entry-points/generate-sw');
const generateSWString = require('./entry-points/generate-sw-string');
const getManifest = require('./entry-points/get-manifest');
const injectManifest = require('./entry-points/inject-manifest');

/**
 * This Node module can be used to generate a list of assets that should be
 * precached in a service worker, generating a hash that can be used to
 * intelligently update a cache when the service worker is updated.
 *
 * This module will use glob patterns to find assets in a given directory
 * and use the resulting URL and revision data for one of the follow uses:
 *
 * 1. Generate a complete service worker with precaching and some basic
 * configurable options, writing the resulting service worker file to disk. See
 * [generateSW()]{@link module:workbox-build.generateSW}.
 * 1. Generate a complete service worker with precaching and some basic
 * configurable options, without writing the results to disk. See
 * [generateSWString()]{@link module:workbox-build.generateSWString}.
 * 1. Inject a manifest into an existing service worker. This allows you
 * to control your own service worker while still taking advantage of
 * [workboxSW.precache()]{@link module:workbox-sw.WorkboxSW#precache} logic.
 * See [injectManifest()]{@link module:workbox-build.injectManifest}.
 * 1. Just generate a manifest, not a full service worker file.
 * This is useful if you want to make use of the manifest from your own existing
 * service worker file and are okay with including the manifest yourself.
 * See [getManifest()]{@link module:workbox-build.getManifest}.
 *
 * @module workbox-build
 */

/**
 * These are the full set of options that could potentially be used to configure
 * one of the build tools. Each of the build tools has a slightly different way
 * of providing this configuration:
 *
 * - When using the `workbox-build` module directly, pass the
 * configuration object to appropriate method. For example,
 * `workboxBuild.injectManifest(configuration)` or
 * `workboxBuild.generateSW(configuration)`.
 *
 * - When using the `workbox-cli` command line interface, use the
 * `--config-file` flag to point to a
 * [CommonJS module file](https://nodejs.org/docs/latest/api/modules.html) that
 * assigns the configuration object to `module.exports`.
 *
 * - When using `workbox-webpack-plugin` within a
 * [Webpack](https://webpack.js.org/) build, pass the configuration object to
 * the plugin's constructor, like
 * `new WorkboxBuildWebpackPlugin(configuration)`.
 *
 * Some specific options might not make sense with certain combinations of
 * interfaces. In those cases, the limitations are called out in the
 * documentation, and may lead to build-time warnings or errors.
 *
 * Each option documented here includes an example, which, for the sake of
 * illustration, assumes the following local filesystem setup. Please adjust
 * the example values to match your actual setup.
 *
 * ```sh
 * ./
 * ├── dev/
 * │   ├── app.js
 * │   ├── ignored.html
 * │   ├── image.png
 * │   ├── index.html
 * │   ├── main.css
 * │   ├── sw.js
 * │   └── templates/
 * │       └── app_shell.hbs
 * └── dist/
 *     ├── app.js
 *     ├── image.png
 *     ├── index.html
 *     ├── main.css
 *     └── sw.js
 * ```
 *
 * @typedef {Object} Configuration
 *
 * @property {String} swDest The path to the final service worker
 * file that will be created by the build process, relative to the current
 * working directory.
 *
 * E.g.: `'./dist/sw.js'`
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build.generateSW|generateSW()} or
 * {@link module:workbox-build.injectManifest|injectManifest()}.
 *
 * @property {String} swSrc The path to the source service worker
 * containing a `precache([])` placeholder, which will be replaced with the
 * precache manifest generated by the build.
 *
 * E.g.: `'./dev/sw.js'`
 *
 *  Note: This option is only valid when used with
 *  {@link module:workbox-build.injectManifest|injectManifest()}.
 *
 * @property {String} swTemplate A service worker template that should be
 * populated based on the configuration provided. The template should be in a
 * format that [`lodash.template`](https://lodash.com/docs/4.17.4#template)
 * understands.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build.generateSWNoFS|generateSWNoFS()}.
 *
 * @property {boolean} [importWorkboxFromCDN=true] If `true`, the WorkboxSW
 * runtime will be automatically imported into the generated service worker from
 * the official CDN URL. If `false`, the WorkboxSW runtime will be copied
 * locally into your `swDest` directory when using
 * {@link module:workbox-build.generateSW|generateSW()}.
 * If `process.env.NODE_ENV` is set to a string starting with `dev` then the
 * `dev` bundle of WorkboxSW, with additional assertions and debugging info,
 * will be used; otherwise, the `prod` bundle will be used.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build.generateSW|generateSW()} or
 * {@link module:workbox-build.generateSWNoFS|generateSWNoFS()}.
 *
 * @property {Array<String>} [importScripts] An optional list of JavaScript
 * files that should be passed to
 * [`importScripts()`](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts)
 * inside the generated service worker file.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build.generateSW|generateSW()} or
 * {@link module:workbox-build.generateSWNoFS|generateSWNoFS()}.
 *
 * @property {Array<String>} [globPatterns=['**\/*.{js,css,html}']]
 * Files matching against any of these
 * [glob patterns](https://github.com/isaacs/node-glob) will be included in the
 * precache manifest.
 *
 * E.g.: `'**\/*.{js,css,html,png}'`
 *
 * @property {String} globDirectory The base directory you wish to
 * match `globPatterns` against, related to the current working directory.
 *
 * E.g.: `'./dev'`
 *
 * @property {String|Array<String>} [globIgnores='node_modules']
 * Files matching against any of these glob patterns will be excluded from the
 * file manifest, overriding any matches from `globPatterns`.
 *
 * E.g. `['**\/ignored.html']`
 *
 * @property {Object<String,Array|string>} [templatedUrls]
 * If a URL is rendered generated based on some server-side logic, its contents
 * may depend on multiple files or on some other unique string value.
 *
 * If used with an array of strings, they will be interpreted as
 * [glob patterns](https://github.com/isaacs/node-glob), and the contents of
 * any files matching the patterns will be used to uniquely version the URL.
 *
 * If used with a single string, it will be interpreted as unique versioning
 * information that you've generated out of band for a given URL.
 *
 * E.g.
 * ```js
 * {
 *   '/app-shell': [
 *     'dev/templates/app-shell.hbs',
 *     'dev/**\/*.css',
*    ],
 *   '/other-page': 'my-version-info',
 * }
 * ```
 *
 * @property {number} [maximumFileSizeToCacheInBytes=2097152]
 * This value can be used to determine the maximum size of files that will be
 * precached. This prevents you from inadvertantly precaching very large files
 * that might have been accidentally match your `globPatterns` values.
 *
 * @property {Array<ManifestTransform>} [manifestTransforms] An array of
 * manifest transformations, which will be applied sequentially against the
 * generated manifest. If `modifyUrlPrefix` or `dontCacheBustUrlsMatching` are
 * also specified, their corresponding transformations will be applied first.
 *
 * See {@link module:workbox-build.ManifestTransform|ManifestTransform}.
 *
 * @property {Object<String,String>} [modifyUrlPrefix] A mapping of
 * prefixes that, if present in an entry in the precache manifest, will be
 * replaced with the corresponding value.
 *
 * This can be used to, for example, remove or add a path prefix from a manifest
 * entry if your web hosting setup doesn't match your local filesystem setup.
 *
 * As an alternative with more flexibility, you can use the `manifestTransforms`
 * option and provide a function that modifies the entries in the manifest using
 * whatever logic you provide.
 *
 * E.g.
 * ```js
 * {
 *   '/prefix-to-remove': '',
 * }
 * ```
 *
 * @property {RegExp} [dontCacheBustUrlsMatching] Assets that match this
 * regex will be assumed to be uniquely versioned via their URL, an exempted
 * from the normal HTTP cache-busting that's done when populating the precache.
 *
 * While not required, it's recommended that if your existing build process
 * already inserts a `[hash]` value into each filename, you provide a RegExp
 * that will detect those values, as it will reduce the amount of bandwidth
 * consumed when precaching.
 *
 * E.g. `/\.\w{8}\./`
 *
 * @property {String} [navigateFallback] This will be used to create a
 * {@link module:workbox-routing.NavigationRoute|NavigationRoute} that will
 * respond to navigation requests for URLs that that aren't precached.
 *
 * This is meant to be used in a
 * [Single Page App](https://en.wikipedia.org/wiki/Single-page_application)
 * scenario, in which you want all navigations to result in common App Shell
 * HTML being reused.
 *
 * It's *not* intended for use as a fallback that's displayed when the browser
 * is offline.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly add in a call to
 * {@link module:workbox-sw.Router#registerNavigationRoute|
 * registerNavigationRoute()}
 * in your `swSrc` file.
 *
 * E.g. `'/app-shell'`
 *
 * @property {Array<RegExp>} [navigateFallbackWhitelist=/./] An optional
 * array of regular expressions that restrict which URLs the navigation route
 * applies to.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly add in the whitelist when calling
 * {@link module:workbox-sw.Router#registerNavigationRoute|
 * registerNavigationRoute()}
 * in your `swSrc` file.
 *
 * E.g. `[/pages/, /articles/]`
 *
 * @property {String} [cacheId] An optional ID to be prepended to caches
 * used by `workbox-sw`. This is primarily useful for local development where
 * multiple sites may be served from the same `http://localhost` origin.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * E.g. `'my-app-name'`
 *
 * @property {Boolean} [skipWaiting=false] Whether or not the service worker
 * should skip over the [waiting](https://developers.google.com/web/fundamentals/instant-and-offline/service-worker/lifecycle#waiting)
 * lifecycle stage.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * @property {Boolean} [clientsClaim=false] Whether or not the service worker
 * should [start controlling](https://developers.google.com/web/fundamentals/instant-and-offline/service-worker/lifecycle#clientsclaim)
 * any existing clients as soon as it activates.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * @property {string} [directoryIndex='index.html'] If a request for a URL
 * ending in '/' fails, this value will be appended to the URL and a second
 * request will be made.
 *
 * This should be configured to whatever your web server is using, if anything,
 * for its [directory index](https://httpd.apache.org/docs/2.0/mod/mod_dir.html).
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * @property {Array<Object>} [runtimeCaching] Passing in an array of objects
 * containing `urlPattern`s, `handler`s, and potentially `option`s that will add
 * the appropriate code to the generated service worker to handle runtime
 * caching.
 *
 * Requests for precached URLs that are picked up via `globPatterns` are handled
 * by default, and don't need to be accomodated in `runtimeCaching`.
 *
 * The `handler` values correspond the names of the
 * {@link module:workbox-sw.Strategies|strategies} supported by `workbox-sw`.
 *
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly add in the corresponding runtime caching behavior via
 * {@link module:workbox-sw.Router#registerRoute|registerRoute()} in your
 * `swSrc` file.
 *
 * E.g.
 * ```js
 * [{
 *   // You can use a RegExp as the pattern:
 *   urlPattern: /.jpg$/,
 *   handler: 'cacheFirst',
 *   // Any options provided will be used when
 *   // creating the caching strategy.
 *   options: {
 *     cacheName: 'image-cache',
 *     cacheExpiration: {
 *       maxEntries: 10,
 *     },
 *   },
 * }, {
 *   // You can also use Express-style strings:
 *   urlPattern: 'https://example.com/path/to/:file',
 *   handler: 'staleWhileRevalidate',
 *   options: {
 *     cacheableResponse: {
         statuses: [0],
 *     },
 *   },
 * }]
 * ```
 *
 * @property {Array<RegExp>} [ignoreUrlParametersMatching=[/^utm_/]] Any
 * search parameter names that match against one of the regex's in this array
 * will be removed before looking for a precache match.
 *
 * This is useful if your users might request URLs that contain, for example,
 * URL parameters used to track the source of the traffic. Those URL parameters
 * would normally cause the cache lookup to fail, since the URL strings used
 * as cache keys would not be expected to include them.
 *
 * You can use `[/./]` to ignore all URL parameters.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * E.g. `[/homescreen/]`
 *
 * @property {Boolean} [handleFetch=true] Whether or not `workbox-sw` should
 * create a `fetch` event handler that responds to network requests. This is
 * useful during development if you don't want the service worker serving stale
 * content.
 *
 * Note: This option is only valid when used with
 * {@link module:workbox-build#generateSW|generateSW()}. When using
 * {@link module:workbox-build.injectManifest|injectManifest()}, you can
 * explicitly pass the desired value in to the
 * {@link module:workbox-sw.WorkboxSW|WorkboxSW() constructor} in your `swSrc`
 * file.
 *
 * @memberof module:workbox-build
 */

module.exports = {
  copyWorkboxLibraries,
  generateSW,
  generateSWString,
  getManifest,
  injectManifest,
};
