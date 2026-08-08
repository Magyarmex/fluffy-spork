/* NOVA TANKS v1.7.9 — Living Archive runtime cleanup
 * Test hooks are intentionally available to isolated node tests but are not release metadata.
 * Remove them before DOMContentLoaded so the archive discovery pass cannot mistake them for a release post.
 */
(function(){'use strict';try{delete window.__NOVA_LIVING_ARCHIVE_TEST__;}catch(_){window.__NOVA_LIVING_ARCHIVE_TEST__=null;}})();
