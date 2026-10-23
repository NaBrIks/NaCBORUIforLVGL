# CSS subset

Pure browser/Node module. importCss(source,{kind,document,capabilities}) returns {ok,document,diagnostics,changes}; failed imports have no output document. exportCss(document,{kind}) rejects properties outside the subset. No DOM, fetching or style injection. See [syntax and limits](../../docs/readme_modules_files_css_mcp_ru.md).
