# typedoc-plugin-dt-links

Adds support for linking references to types declared in `@types` packages
to their source code on GitHub.

> Note: If TypeDoc's [useTsLinkResolution] option is off, this plugin won't work.

If VSCode can follow a link into an `@types` package, this plugin should also
be able to provide links to that package.

> Note: Using TypeDoc before 0.26.8 may result in links which go to the start of
> the doc comment rather to the symbol name.

Supports TypeDoc 0.23.14 through 0.26.x.

## Options

-   `warnOnUnstableDtLink`

    Defaults to `true`. If set, and an `@types` package is referenced which is newer
    than this plugin, produces a warning as this plugin won't be able to produce a stable
    link.

    This plugin is automatically published weekly, so if you are upgrading `@types` packages
    and rebuilding docs more frequently than that, you may want to disable this option as
    the link won't be dead long enough to matter.

## Changelog

See full changelog [here](./CHANGELOG.md).

## How It Works

TypeDoc exposes an API which plugins can use to provide links to external
symbols. TypeDoc will also provide plugins with a [ReflectionSymbolId] object
which plugins can use to determine where TypeScript thinks the link should
resolve to.

This plugin uses that object to figure out which `@types` package a symbol
belongs to by checking the path for `node_modules/@types` and constructs
a link to GitHub for the package.

The constructed link must include a version reference in order to not break when
the referenced package receives updates. As `@types` packages do not include any
information about what git hash they were published with, this plugin attempts
to infer what the git hash for the version must have been by parsing the "Last
Updated" date out of the README.md file for the plugin and matching it to a list
of all commits in DefinitelyTyped published with this package. If the package
was released more recently than this plugin, the plugin can't know what git hash
should be used and will instead use `master` as the reference.

[useTsLinkResolution]: https://typedoc.org/options/comments/#usetslinkresolution
[ReflectionSymbolId]: (https://typedoc.org/api/classes/Models.ReflectionSymbolId.html)
