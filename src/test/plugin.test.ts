import { test, before, describe } from "node:test";
import { ok, deepStrictEqual as equal } from "node:assert";

import {
    Application,
    InlineTagDisplayPart,
    ProjectReflection,
    ReflectionSymbolId,
} from "typedoc";
import {
    findDtCommitHash,
    load,
    DT_COMMITS,
    getLineNumber,
} from "../plugin.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// DT_COMMITS data:
// ...
// e637ce5363 1727894952
// c1b76e12ba 1727892072
// 26a3701341 1727891206
// ...
// a976315cac 1349455778
// 647369a322 1349455186

describe("findDtCommitHash", () => {
    test("After most recent commit", () => {
        const hash = findDtCommitHash(DT_COMMITS[0][1] + 1);
        equal(hash, undefined);
    });

    test("Exactly matching a commit time", () => {
        const hash = findDtCommitHash(1727892072);
        equal(hash, "c1b76e12ba");
    });

    test("Slightly before a commit time", () => {
        const hash = findDtCommitHash(1727892072 - 1);
        equal(hash, "26a3701341");
    });

    test("Slightly after a commit time", () => {
        const hash = findDtCommitHash(1727892072 + 1);
        equal(hash, "c1b76e12ba");
    });

    test("Last commit hash", () => {
        equal(findDtCommitHash(0), "647369a322");
        equal(findDtCommitHash(1349455186 + 1), "647369a322");
        equal(findDtCommitHash(1349455186 - 1), "647369a322");
    });

    test("@types/node v22.7.4", () => {
        equal(findDtCommitHash(1727453312), "4b49cac499");
    });
});

describe("getLineNumber", () => {
    const BASE = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../node_modules/@types/node",
    ).replaceAll("\\", "/");

    test("EventEmitter", () => {
        const symId = new ReflectionSymbolId({
            sourceFileName: `${BASE}/events.d.ts`,
            qualifiedName: "EventEmitter",
        });
        equal(getLineNumber(symId), 101);
    });

    test("__global.NodeJS.EventEmitter.getMaxListeners", () => {
        const symId = new ReflectionSymbolId({
            sourceFileName: `${BASE}/events.d.ts`,
            qualifiedName: "__global.NodeJS.EventEmitter.getMaxListeners",
        });
        // Note that this isn't the first getMaxListeners in the file!
        // We intelligently follow the source tree to try to find the method.
        equal(getLineNumber(symId), 773);
    });

    test("EventEmitterOptions.captureRejections", () => {
        const symId = new ReflectionSymbolId({
            sourceFileName: `${BASE}/events.d.ts`,
            qualifiedName: "EventEmitterOptions.captureRejections",
        });
        equal(getLineNumber(symId), 75);
    });
});

describe("plugin", () => {
    let project: ProjectReflection;

    before(async () => {
        const app = await Application.bootstrap({
            entryPoints: ["src/testdata/links.ts"],
            skipErrorChecking: true,
            // logLevel: "Verbose",
        });
        load(app);
        app.options.setValue("warnOnUnstableDtLink", true);
        project = (await app.convert())!;
        ok(project);
    });

    test("Handles comment links", () => {
        const refl = project.getChildByName("comment");
        ok(refl);
        const tags = (
            refl?.comment?.summary.filter(
                (f) => f.kind === "inline-tag",
            ) as InlineTagDisplayPart[]
        ).map((part) => ({ target: part.target, text: part.text }));

        const eventLink = (line: number) =>
            "https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4b49cac499/types/node/events.d.ts#L" +
            line;

        equal(tags, [
            {
                target: eventLink(102),
                text: "EventEmitter",
            },
            {
                target: eventLink(359),
                text: "EventEmitter.getMaxListeners",
            },
            {
                target: eventLink(769),
                text: "EventEmitter#getMaxListeners",
            },
        ]);
    });
});
