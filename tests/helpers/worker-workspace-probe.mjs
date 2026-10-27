// Trusted worker source only, inert file data, synthetic mount ownership.
// All filesystem paths are remapped under this private temporary directory.
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "forecode-worker-copy-"));
const actual = (name) => {
  if (!/^\/(?:source|work|toolchain)(?:\/|$)/.test(name) || name.includes(".."))
    throw Error("Unexpected synthetic filesystem access");
  return path.join(root, name);
};
const result = { imports: [], exits: [], chdirs: [], mountRootChmod: false };
try {
  await fs.mkdir(actual("/source/nested"), { recursive: true });
  await fs.writeFile(
    actual("/source/nested/marker.txt"),
    "INERT BASELINE DATA",
    {
      mode: 0o444,
    },
  );
  await fs.mkdir(actual("/work"), { mode: 0o1777 });
  await fs.mkdir(actual("/toolchain/node_modules"), { recursive: true });
  const filesystem = {
    cp: (from, to, options) => fs.cp(actual(from), actual(to), options),
    mkdir: (name, options) => fs.mkdir(actual(name), options),
    readdir: (name, options) => fs.readdir(actual(name), options),
    symlink: (from, to) => fs.symlink(actual(from), actual(to)),
    chmod: (name, mode) => {
      if (name === "/work") {
        result.mountRootChmod = true;
        throw Object.assign(Error("Synthetic root-owned tmpfs mount"), {
          code: "EPERM",
        });
      }
      return fs.chmod(actual(name), mode);
    },
  };
  const context = vm.createContext({
    process: {
      argv: ["node", "worker.mjs", "isolation"],
      chdir(name) {
        actual(name);
        result.chdirs.push(name);
      },
      exit(code) {
        result.exits.push(code);
        throw Error("FIXED_PROBE_EXIT");
      },
    },
  });
  function moduleFor(exports) {
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports))
          this.setExport(name, value);
      },
      { context },
    );
  }
  const forbidden = () => {
    throw Error("No candidate, HTTP server or subprocess may run in this test");
  };
  const source = await fs.readFile(process.argv[2], "utf8");
  const worker = new vm.SourceTextModule(source, {
    context,
    async importModuleDynamically(name) {
      result.imports.push(name);
      if (name !== "/bridge/probe.mjs") throw Error("Candidate import blocked");
      const probe = moduleFor({});
      await probe.link(forbidden);
      await probe.evaluate();
      return probe;
    },
  });
  await worker.link((name) => {
    if (name === "node:fs/promises") return moduleFor(filesystem);
    if (name === "node:child_process")
      return moduleFor({ spawnSync: forbidden });
    if (name === "node:http") return moduleFor({ createServer: forbidden });
    throw Error("Unexpected trusted worker import");
  });
  try {
    await worker.evaluate();
  } catch (error) {
    if (error.message !== "FIXED_PROBE_EXIT") throw error;
  }
  const work = result.chdirs[0];
  if (!work) throw Error("Worker never reached its private workspace");
  result.copy = await fs.readFile(actual(work + "/nested/marker.txt"), "utf8");
  result.original = await fs.readFile(
    actual("/source/nested/marker.txt"),
    "utf8",
  );
  result.copyMode =
    (await fs.stat(actual(work + "/nested/marker.txt"))).mode & 0o777;
  result.sourceMode =
    (await fs.stat(actual("/source/nested/marker.txt"))).mode & 0o777;
  result.toolingSymlink = await fs.readlink(actual(work + "/node_modules"));
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(
    JSON.stringify({ ...result, error: error.code || error.message }),
  );
  process.exitCode = 1;
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
