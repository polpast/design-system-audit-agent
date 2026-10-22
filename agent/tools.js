// The agent's three tools. They run in the page; the model only sees name, description and inputSchema.
// `inv` is the component inventory, `proposals` the approval queue, `ui.step()` writes to the visible work log.
// propose_change only queues a proposal: there is deliberately no tool that applies a change.

function makeTools(ui){
  return [
    { name:"list_components",
      description:"Lists components in the library with usage numbers and current status. Optional category filter: Actions, Forms, Feedback, Layout, Navigation, Data. Returns an array.",
      inputSchema:{type:"object",properties:{category:{type:"string"}}},
      execute(input){
        const cat = input.category ? String(input.category) : "";
        const rows = inv.filter(c => !cat || c.category.toLowerCase() === cat.toLowerCase())
          .map(({name,category,instances,detachedPct,lastUpdated,status}) => ({name,category,instances,detachedPct,lastUpdated,status,
            pendingProposal: proposals.some(p => p.status==="pending" && p.component===name)}));
        if (!rows.length){ ui.step(`No components in category "${cat}"`, "err"); throw new Error(`No category "${cat}". Categories: Actions, Forms, Feedback, Layout, Navigation, Data.`); }
        ui.step(`Read ${rows.length} components${cat ? " in " + cat : ""}`);
        return rows;
      }},
    { name:"get_component",
      description:"Returns full details for one component: usage, detachment rate, overlaps, accessibility findings, notes, teams using it. Throws with close matches if the name is not found.",
      inputSchema:{type:"object",properties:{name:{type:"string"}},required:["name"]},
      execute(input){
        const name = String(input.name||""); const c = findComp(name);
        if (!c){ const s = suggest(name); ui.step(`Lookup failed: no component "${name}"`, "err");
          throw new Error(`No component named "${name}". Closest matches: ${s.join(", ")}.`); }
        ui.step(`Read details of ${c.name}`);
        return c;
      }},
    { name:"propose_change",
      description:"Queues a proposed change for human approval. It does NOT change the library; a person approves or rejects it. action: keep | merge | deprecate | update. For merge, target is the component that remains. confidence: high | medium | low. For low confidence, fill whatWouldSettleIt.",
      inputSchema:{type:"object",properties:{
        component:{type:"string"}, action:{type:"string",enum:["keep","merge","deprecate","update"]}, target:{type:"string"},
        rationale:{type:"string",description:"1-2 sentences for the reviewer"}, evidence:{type:"string",description:"The numbers and findings this rests on"},
        confidence:{type:"string",enum:["high","medium","low"]}, whatWouldSettleIt:{type:"string"}},
        required:["component","action","rationale","evidence","confidence"]},
      execute(input){
        const c = findComp(input.component);
        if (!c){ ui.step(`Proposal refused: unknown component "${input.component}"`, "err"); throw new Error(`Unknown component "${input.component}". Look it up with get_component first.`); }
        if (!ACT[input.action]) throw new Error("action must be keep, merge, deprecate or update.");
        if (input.action === "merge"){ const t = findComp(input.target);
          if (!t || t.name === c.name){ ui.step(`Proposal refused: bad merge target "${input.target||""}"`, "err"); throw new Error("merge needs a target that is a different, existing component."); } }
        if (proposals.some(p => p.status==="pending" && p.component===c.name)){ ui.step(`Skipped: ${c.name} already has a pending proposal`, "err"); throw new Error(`A proposal for ${c.name} is already waiting for approval.`); }
        if (proposals.some(p => p.status==="rejected" && p.component===c.name && p.action===input.action)) {
          ui.step(`Refused: reviewer already rejected this for ${c.name}`, "err"); throw new Error("The reviewer already rejected this exact change. Do not propose it again unless they ask."); }
        const p = addProposal(input);
        ui.step(`Proposed: ${phrase(p)} (${p.confidence})`, "propose");
        return {queued:true, note:"Waiting for human approval. Nothing has been applied."};
      }}
  ];
}

