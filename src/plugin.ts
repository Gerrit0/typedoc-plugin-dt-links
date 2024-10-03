import {
    Application,
    CommentDisplayPart,
    DeclarationReference,
    ParameterType,
    Reflection,
    ReflectionSymbolId,
    splitUnquotedString,
    TypeScript as ts,
} from "typedoc";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare module "typedoc" {
    export interface TypeDocOptionMap {
        warnOnUnstableLink: boolean;
    }
}

const PLUGIN_PREFIX = "[typedoc-plugin-dt-links]";

const DT_DEFAULT_BRANCH = "master";
export const DT_COMMITS: [string, number][] = readFileSync(
    dirname(fileURLToPath(import.meta.url)) + "/../data/dt_history.txt",
    "utf-8",
)
    .split("\n")
    .map((line) => {
        const split = line.split(" ");
        return [split[0], +split[1]];
    });

// Binary search DT_COMMITS for the commit just before date
export function findDtCommitHash(date: number) {
    // If the date is after the most recent commit, we don't have it in history
    // and should use the default git branch.
    if (date > DT_COMMITS[0][1]) {
        return undefined;
    }

    let low = 0;
    let high = DT_COMMITS.length;

    // Bias the search towards the package having been published fairly recently.
    let guess = 4096;

    while (high > low) {
        if (DT_COMMITS[guess][1] < date) {
            high = guess;
        } else {
            low = guess + 1;
        }

        guess = low + Math.floor((high - low) / 2);
    }

    if (guess >= DT_COMMITS.length) {
        return DT_COMMITS[DT_COMMITS.length - 1][0];
    }

    if (guess > 0 && DT_COMMITS[guess - 1][1] === date) {
        return DT_COMMITS[guess - 1][0];
    }

    return DT_COMMITS[guess][0];
}

function discoverSourceFilePosition(sf: ts.SourceFile, qualifiedName: string) {
    const path = splitUnquotedString(qualifiedName, ".");
    return walkPath(0, sf);

    function walkPath(index: number, node: ts.Node) {
        if (index === path.length) {
            const name = (node as any).name;
            if (
                name &&
                (ts.isMemberName(name) || ts.isComputedPropertyName(name))
            ) {
                return name.getStart(sf, false);
            }
            return node.getStart(sf, false);
        }

        return ts.forEachChild(node, (child): number | undefined => {
            // declare module "events" {
            // namespace NodeJS {
            // global {
            if (ts.isModuleDeclaration(child)) {
                if (ts.isStringLiteral(child.name)) {
                    // Not included in the qualified name from TypeDoc
                    return walkPath(index, child);
                } else if (child.name.text === path[index]) {
                    return walkPath(index + 1, child);
                } else if (
                    child.name.text === "global" &&
                    // Not quite sure why TypeDoc gives this name...
                    path[index] === "__global"
                ) {
                    return walkPath(index + 1, child);
                }
            }

            if (
                ts.isModuleBlock(child) ||
                ts.isVariableDeclaration(child) ||
                ts.isVariableDeclarationList(child)
            ) {
                return walkPath(index, child);
            }

            if (
                ts.isClassDeclaration(child) ||
                ts.isInterfaceDeclaration(child)
            ) {
                if ((child.name?.text ?? "default") === path[index]) {
                    return walkPath(index + 1, child);
                }
            }

            if (
                ts.isFunctionDeclaration(child) ||
                ts.isPropertyDeclaration(child) ||
                ts.isVariableDeclaration(child) ||
                ts.isMethodDeclaration(child) ||
                ts.isMethodSignature(child) ||
                ts.isPropertySignature(child) ||
                ts.isPropertyAssignment(child)
            ) {
                if (child.name?.getText() === path[index]) {
                    return walkPath(index + 1, child);
                }
            }
        });
    }
}

const sourceFileCache = new Map<string, ts.SourceFile>();
export function getLineNumber(symbolId: ReflectionSymbolId): number {
    let sf = sourceFileCache.get(symbolId.fileName);
    if (!sf) {
        try {
            sf = ts.createSourceFile(
                symbolId.fileName,
                readFileSync(symbolId.fileName, "utf-8"),
                {
                    languageVersion: ts.ScriptTarget.ESNext,
                    jsDocParsingMode: ts.JSDocParsingMode.ParseNone,
                    impliedNodeFormat: ts.ModuleKind.ESNext,
                },
                true,
                ts.ScriptKind.TS,
            );
        } catch {
            sf = ts.createSourceFile(
                symbolId.fileName,
                "",
                ts.ScriptTarget.ESNext,
                true,
                ts.ScriptKind.TS,
            );
        }
        sourceFileCache.set(symbolId.fileName, sf);
    }

    if (Number.isFinite(symbolId.pos)) {
        // Add 1 as the pos we get from TypeDoc will reference the start of
        // the node, not the actual line on which the declaration lives.
        return sf.getLineAndCharacterOfPosition(symbolId.pos).line + 1;
    } else {
        // Ick! pos isn't serialized, so if we're dealing with JSON we have to
        // make an educated guess about what line we ought to link to. If we can't
        // find it, just link to the top of the file.
        const pos = discoverSourceFilePosition(sf, symbolId.qualifiedName) ?? 0;
        return sf.getLineAndCharacterOfPosition(pos).line;
    }
}

export function load(app: Application) {
    app.options.addDeclaration({
        name: "warnOnUnstableDtLink",
        defaultValue: true,
        help: `${PLUGIN_PREFIX} Generate a warning if unable to link to a specific commit for a DT package.`,
        type: ParameterType.Boolean,
    });

    app.converter.addUnknownSymbolResolver(resolveSymbol);

    const publishHashCache = new Map<string, string>();
    function getPublishHash(packagePath: string, packageName: string) {
        let hash = publishHashCache.get(packagePath);

        if (!hash) {
            try {
                const readme = readFileSync(
                    packagePath + "/README.md",
                    "utf-8",
                );
                const update = readme.match(/Last updated:(.*)$/im);

                if (!update) {
                    hash = DT_DEFAULT_BRANCH;
                } else {
                    const publishDate = Date.parse(update[1]);
                    app.logger.verbose(
                        `${PLUGIN_PREFIX} @types/${packageName} was updated at ${new Date(publishDate).toISOString()}`,
                    );

                    hash =
                        findDtCommitHash(publishDate / 1000) ??
                        DT_DEFAULT_BRANCH;
                }
            } catch {
                hash = DT_DEFAULT_BRANCH;
            }

            if (
                hash === DT_DEFAULT_BRANCH &&
                app.options.getValue("warnOnUnstableDtLink")
            ) {
                const version = JSON.parse(
                    readFileSync(packagePath + "/package.json", "utf-8"),
                ).version;
                app.logger.warn(
                    `${PLUGIN_PREFIX} Failed to discover git hash for @types/${packageName} v${version}, linking to ${DT_DEFAULT_BRANCH} branch. This will eventually cause broken links.`,
                );
            }

            app.logger.verbose(
                `${PLUGIN_PREFIX} mapping @types/${packageName} to ${hash}`,
            );

            publishHashCache.set(packagePath, hash);
        }

        return publishHashCache.get(packagePath)!;
    }

    function resolveSymbol(
        _declaration: DeclarationReference,
        _refl: Reflection,
        _part: CommentDisplayPart | undefined,
        symbolId: ReflectionSymbolId | undefined,
    ): string | undefined {
        if (!symbolId) {
            return;
        }

        // Attempt to decide package name from path if it contains "node_modules"
        let startIndex = symbolId.fileName.lastIndexOf("node_modules/@types/");
        if (startIndex === -1) return;
        startIndex += "node_modules/@types/".length;
        let stopIndex = symbolId.fileName.indexOf("/", startIndex);
        const packageName = symbolId.fileName.substring(startIndex, stopIndex);
        const innerPath = symbolId.fileName
            .substring(stopIndex)
            .replaceAll("\\", "/");

        const hash = getPublishHash(
            symbolId.fileName.substring(0, stopIndex),
            packageName,
        );

        return [
            "https://github.com/DefinitelyTyped/DefinitelyTyped/blob/",
            hash,
            "/types/",
            packageName,
            innerPath,
            "#L",
            getLineNumber(symbolId) + 1,
        ].join("");
    }
}
