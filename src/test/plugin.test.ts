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
        equal(hash, "c1b76e12ba94c0faaf6eca5d65292be845840d02");
    });

    test("Slightly before a commit time", () => {
        const hash = findDtCommitHash(1727892072 - 1);
        equal(hash, "26a3701341c4edfa8e2aa60f71f065dc457f4442");
    });

    test("Slightly after a commit time", () => {
        const hash = findDtCommitHash(1727892072 + 1);
        equal(hash, "c1b76e12ba94c0faaf6eca5d65292be845840d02");
    });

    test("Last commit hash", () => {
        equal(findDtCommitHash(0), "647369a322be470d84f8d226e297267a7d1a0796");
        equal(
            findDtCommitHash(1349455186 + 1),
            "647369a322be470d84f8d226e297267a7d1a0796",
        );
        equal(
            findDtCommitHash(1349455186 - 1),
            "647369a322be470d84f8d226e297267a7d1a0796",
        );
    });

    test("@types/node v22.7.4", () => {
        equal(
            findDtCommitHash(1727453312),
            "4b49cac49912d6036a706ab6675c6c93751de00c",
        );
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
            "https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4b49cac49912d6036a706ab6675c6c93751de00c/types/node/events.d.ts#L" +
            line;

        equal(tags, [
            {
                target: eventLink(102),
                text: "EventEmitter",
            },
            {
                target: eventLink(387),
                text: "EventEmitter.getMaxListeners",
            },
            {
                target: eventLink(774),
                text: "EventEmitter#getMaxListeners",
            },
        ]);
    });
});
