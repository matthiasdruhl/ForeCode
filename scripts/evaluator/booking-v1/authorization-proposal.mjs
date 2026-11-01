// Trusted preparation only. Never imports or executes the supplied module.
// Actual protected input/output stays in the guest; tests use synthetic source.
export function proposeAwaitedAuthorizationInstrumentation(
  ts,
  source,
  selection,
) {
  const unit = ts.createSourceFile(
    "oracle.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (unit.parseDiagnostics.length)
    throw new Error("Invalid proposal source syntax.");
  const groups = new Set([
    "team-permissions-domain",
    "team-permissions-http",
    "team-permissions-adversarial",
  ]);
  const roots = unit.statements.filter(
    (n) =>
      ts.isFunctionDeclaration(n) &&
      n.name?.text === "runTeamOracle" &&
      n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
  if (roots.length !== 1)
    throw new Error("One fixed exported oracle function required.");
  const root = roots[0];
  if (
    !root.body ||
    root.asteriskToken ||
    root.parameters.length !== 2 ||
    !root.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
    root.parameters.some(
      (p) => !ts.isIdentifier(p.name) || p.dotDotDotToken || p.initializer,
    )
  )
    throw new Error("Unsupported original oracle signature.");
  const parameter = root.parameters[0].name.text;
  const observer = "forecodeObserveAuthorizationCase";
  let collision = false,
    helper = null,
    helperDeclarations = 0;
  const assertions = new Set();
  for (const n of unit.statements)
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      ["node:assert", "node:assert/strict", "assert", "assert/strict"].includes(
        n.moduleSpecifier.text,
      )
    ) {
      if (n.importClause?.name) assertions.add(n.importClause.name.text);
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) assertions.add(named.name.text);
    }
  function inspect(n) {
    if (ts.isIdentifier(n) && n.text === observer) collision = true;
    if (
      (ts.isVariableDeclaration(n) ||
        ts.isFunctionDeclaration(n) ||
        ts.isParameter(n)) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "reject"
    ) {
      helperDeclarations++;
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        (ts.isArrowFunction(n.initializer) ||
          ts.isFunctionExpression(n.initializer)) &&
        n.initializer.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
        )
      )
        helper = n.initializer;
    }
    ts.forEachChild(n, inspect);
  }
  inspect(unit);
  if (collision || helperDeclarations !== 1 || !helper)
    throw new Error("Unique existing async assertion helper required.");
  let helperAssertions = 0;
  function count(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      assertions.has(n.expression.expression.text)
    )
      helperAssertions++;
    ts.forEachChild(n, count);
  }
  count(helper);
  if (!helperAssertions)
    throw new Error("Existing assertion helper is not established.");
  function guard(condition) {
    while (ts.isParenthesizedExpression(condition))
      condition = condition.expression;
    if (
      !ts.isBinaryExpression(condition) ||
      ![
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
      ].includes(condition.operatorToken.kind)
    )
      return null;
    const pairs = [
      [condition.left, condition.right],
      [condition.right, condition.left],
    ];
    for (const [left, right] of pairs)
      if (
        ts.isIdentifier(left) &&
        left.text === parameter &&
        ts.isStringLiteral(right) &&
        groups.has(right.text)
      )
        return right.text;
    return null;
  }
  const selected = [];
  function select(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "reject" &&
      ts.isAwaitExpression(n.parent)
    ) {
      let cursor = n,
        owner = null,
        loop = false,
        checkId = null,
        conflict = false;
      while (cursor.parent) {
        const parent = cursor.parent;
        if (
          ts.isFunctionDeclaration(parent) ||
          ts.isArrowFunction(parent) ||
          ts.isFunctionExpression(parent) ||
          ts.isMethodDeclaration(parent)
        ) {
          owner = parent;
          break;
        }
        if (
          ts.isForStatement(parent) ||
          ts.isForOfStatement(parent) ||
          ts.isForInStatement(parent) ||
          ts.isWhileStatement(parent) ||
          ts.isDoStatement(parent)
        )
          loop = true;
        if (ts.isIfStatement(parent) && cursor === parent.thenStatement) {
          const group = guard(parent.expression);
          if (group) {
            if (checkId && checkId !== group) conflict = true;
            checkId = group;
          }
        }
        cursor = parent;
      }
      if (owner === root && !loop && checkId && !conflict) {
        if (!ts.isExpressionStatement(n.parent.parent))
          throw new Error(
            "Only standalone awaited assertion calls may be proposed.",
          );
        const start = n.getStart(unit),
          end = n.end,
          p = unit.getLineAndCharacterOfPosition(start);
        selected.push({
          start,
          end,
          checkId,
          line: p.line + 1,
          column: p.character + 1,
        });
      }
    }
    ts.forEachChild(n, select);
  }
  select(root.body);
  if (!selected.length || selected.length > 100)
    throw new Error("No bounded eligible awaited assertion cases.");
  const candidates = selected.map((v, i) => ({
    caseId: `rejection-site-${String(i + 1).padStart(3, "0")}`,
    checkId: v.checkId,
    line: v.line,
    column: v.column,
  }));
  if (
    selection !== undefined &&
    (!Array.isArray(selection) ||
      !selection.length ||
      new Set(selection).size !== selection.length ||
      selection.some((id) => !candidates.some((c) => c.caseId === id)))
  )
    throw new Error("Exact candidate site selection required.");
  const chosen = candidates
    .map((v, i) => ({ mapping: v, site: selected[i] }))
    .filter(
      (v) => selection === undefined || selection.includes(v.mapping.caseId),
    );
  // An async outer function may await inside a call argument. Moving that
  // expression into our non-async callback would create invalid JavaScript or
  // change when it runs. Nested callback functions keep their own semantics.
  for (const { site } of chosen) {
    let unsafe = false;
    function inspectArguments(n) {
      if (
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n)
      )
        return;
      if (ts.isAwaitExpression(n) || ts.isYieldExpression(n)) unsafe = true;
      ts.forEachChild(n, inspectArguments);
    }
    const originalCall = selected.find((v) => v.start === site.start);
    function find(n) {
      if (n.getStart(unit) === originalCall.start && ts.isCallExpression(n)) {
        inspectArguments(n);
        return;
      }
      ts.forEachChild(n, find);
    }
    find(root.body);
    if (unsafe)
      throw new Error(
        "Awaited or yielded assertion-call arguments require separate review.",
      );
  }
  const mapping = chosen.map((v) => v.mapping);
  const edits = chosen.map(({ site: v, mapping }) => ({
    start: v.start,
    end: v.end,
    after: `${observer}(${JSON.stringify(mapping.caseId)}, () => ${source.slice(v.start, v.end)})`,
  }));
  edits.push({
    start: root.parameters.end,
    end: root.parameters.end,
    after: `, ${observer}`,
  });
  edits.push({
    start: root.body.getStart(unit) + 1,
    end: root.body.getStart(unit) + 1,
    after: `\nif (typeof ${observer} !== "function") throw new Error("Protected authorization observer required.");\n`,
  });
  edits.sort((a, b) => a.start - b.start);
  let output = "",
    position = 0;
  const patch = [];
  for (const edit of edits) {
    if (edit.start < position)
      throw new Error("Overlapping authorization edits.");
    output += source.slice(position, edit.start);
    const outputStart = output.length;
    output += edit.after;
    patch.push({
      originalStart: edit.start,
      originalEnd: edit.end,
      outputStart,
      outputEnd: output.length,
      before: source.slice(edit.start, edit.end),
      after: edit.after,
    });
    position = edit.end;
  }
  output += source.slice(position);
  const parsed = ts.createSourceFile(
    "instrumented-oracle.mjs",
    output,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (parsed.parseDiagnostics.length)
    throw new Error("Instrumented proposal syntax invalid.");
  let restored = output;
  for (const edit of [...patch].reverse()) {
    if (restored.slice(edit.outputStart, edit.outputEnd) !== edit.after)
      throw new Error("Authorization edit identity mismatch.");
    restored =
      restored.slice(0, edit.outputStart) +
      edit.before +
      restored.slice(edit.outputEnd);
  }
  if (restored !== source)
    throw new Error("Original oracle restoration mismatch.");
  return {
    source: output,
    mapping,
    patch,
    restorationVerified: true,
    scope:
      "only_standalone_existing_awaited_reject_helper_calls_in_literal_positive_group_guards_outside_loops",
    helperAssertions,
    classification: "UNCLASSIFIED_REJECTION_SITE_CANDIDATES",
    additionalAwaitBookkeeping: true,
  };
}
