// These markers are intentionally scoped to one document lifecycle.
// A reload should open a recognised Conference Manager in the workspace again,
// while deliberate navigation to Welcome within the same page remains possible.
sessionStorage.removeItem('conference_manager_landing_v1');
sessionStorage.removeItem('conference_manager_priority_filter_v1');
