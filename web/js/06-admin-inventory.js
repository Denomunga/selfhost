"use strict";
/* Admin: vehicles, parts, stories, inquiries and store settings forms. */

function admVehicles(){
  const cars = DB.allCars();
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <h3 class="h-3">Inventory (${cars.length})</h3>
      <button class="btn btn--sm btn--solid" id="new-car">Add a Subaru</button>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Vehicle</th><th>Year</th><th>Price</th><th>Mileage</th><th>Status</th><th>Featured</th><th>Actions</th></tr></thead>
      <tbody>${cars.length?cars.map(c=>`<tr>
        <td><a href="#/cars/${esc(c.id)}" style="color:var(--white)">${esc(c.model)} ${esc(c.variant||"")}</a>
            <div class="muted" style="font-size:.76rem">${esc(c.body||"")} · ${esc(c.id)}</div></td>
        <td class="num">${esc(c.year)}</td>
        <td class="num">${ksh(c.price)}</td>
        <td class="num">${km(c.mileage)}</td>
        <td><span class="pill ${c.status==="SOLD"?"pill--sold":"pill--ok"}">${esc(c.status)}</span></td>
        <td>${c.featured?`<span class="pill pill--new">Featured</span>`:`<span class="muted">—</span>`}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="mini" data-edit="${esc(c.id)}">Edit</button>
          <button class="mini" data-sold="${esc(c.id)}">${c.status==="SOLD"?"Mark available":"Mark sold"}</button>
          <button class="mini" data-feat="${esc(c.id)}">${c.featured?"Unfeature":"Feature"}</button>
          <button class="mini mini--danger" data-del="${esc(c.id)}">Delete</button>
        </div></td></tr>`).join("")
        :`<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">No vehicles yet. Add the first Subaru.</td></tr>`}
      </tbody></table></div>`;
}

function admParts(){
  const list = DB.allParts();
  const low = list.filter(p=>{const s=Number(p.stock)||0; return s>0 && s<=3;});
  const out = list.filter(p=>(Number(p.stock)||0)<=0);
  const stockValue = list.reduce((s,p)=>s + partCost(p.id) * (Number(p.stock)||0), 0);
  return `${toolbar("Parts inventory", `<button class="btn btn--sm btn--solid" id="new-part">Add a part</button>`)}
    ${statGrid([["Parts", list.length], ["Stock value (cost)", ksh(stockValue)],
      ["Low stock", low.length], ["Out of stock", out.length]])}
    ${(low.length||out.length)?`<div class="notice ${out.length?"notice--bad":""}" style="margin-bottom:20px">
      ${out.length?`${out.length} part${out.length===1?" is":"s are"} out of stock. `:""}
      ${low.length?`${low.length} part${low.length===1?" has":"s have"} 3 or fewer left.`:""}</div>`:""}
    ${tbl(["Part","SKU","Category","Price","Stock","Status",""], list.map(p=>{
      const st = partStock(p);
      return `<tr>
        <td style="color:var(--white)">${esc(p.name)}</td><td class="muted">${esc(p.sku)}</td>
        <td>${esc(p.category)}</td><td class="num">${ksh(p.price)}</td>
        <td class="num">${esc(p.stock)} ${esc(p.unit||"")}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="mini" data-partedit="${esc(p.id)}">Edit</button>
          <button class="mini mini--danger" data-partdel="${esc(p.id)}">Delete</button>
        </div></td></tr>`;
    }), "No parts yet.")}`;
}

function partForm(id){
  const p = id ? DB.part(id) : null;
  const cost = id ? partCost(id) : "";
  const v = Object.assign({name:"",sku:"",category:"Filters",brand:"",price:"",stock:0,unit:"pcs",
    compatible:[],description:"",status:"ACTIVE",featured:false,images:[]}, p||{});
  EDIT_IMAGES = (v.images||[]).slice();

  openModal(`<div class="modal-head">
      <div><span class="tag">${p?"Edit part":"New part"}</span>
        <h3 class="h-2" style="margin-top:10px">${p?esc(v.name):"Add a part"}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <form id="part-form" class="form-grid">
      ${inputField("pt-name","Name", v.name, "text", "required")}
      ${inputField("pt-sku","SKU", v.sku, "text", "required")}
      ${selectField("pt-cat","Category", PART_CATS, v.category)}
      ${inputField("pt-brand","Brand", v.brand)}
      ${inputField("pt-price","Price (KSh) *", v.price, "number", 'min="0" step="50" required')}
      ${inputField("pt-cost","Cost (KSh, private)", cost, "number", 'min="0" step="50"')}
      ${inputField("pt-stock","Stock quantity", v.stock, "number", 'min="0" step="1" required')}
      ${inputField("pt-unit","Unit", v.unit||"pcs", "text")}
      ${selectField("pt-status","Status", [["ACTIVE","Active"],["DISCONTINUED","Discontinued"]], v.status)}
      <div class="field" style="justify-content:flex-end">
        <label class="tick" style="margin-bottom:10px"><input type="checkbox" id="pt-feat" ${v.featured?"checked":""}> Feature on the homepage</label></div>
      ${inputField("pt-compat","Compatible models (comma separated)", (v.compatible||[]).join(", "))}
      <div class="field full"><label for="pt-desc">Description</label>
        <textarea id="pt-desc">${esc(v.description)}</textarea></div>

      <div class="field full"><label>Images</label>
        <div class="img-tray" id="img-tray"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">
          ${DB.assets?`<label class="mini" style="cursor:pointer">Upload photos
            <input id="pt-upload" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>`
          :``}
          <button type="button" class="mini" id="pt-addplaceholder">Add placeholder</button>
        </div>
        <p class="muted" style="font-size:.78rem;margin:10px 0 0">Until a photo is uploaded, this part shows generated studio artwork for its category.</p>
      </div>

      <div class="full btn-row" style="margin-top:8px;justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="pt-save">${p?"Save changes":"Add part"}</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  const drawPartTray = () => {
    const tray = $("#img-tray"); if(!tray) return;
    tray.innerHTML = EDIT_IMAGES.length ? EDIT_IMAGES.map((im,i)=>`
      <div class="img-cell" data-i="${i}" title="Click to make cover">
        ${im.assetId?`<img src="${API_BASE}/_blob/${esc(im.assetId)}" alt="">`:partSVG({category:(val("#pt-cat")||v.category), seed:"tray"+i})}
        ${i===0?`<span class="cover-tag">Cover</span>`:""}
        <button type="button" data-rm="${i}" aria-label="Remove image">✕</button>
      </div>`).join("")
      : `<p class="muted" style="font-size:.82rem;margin:0">No images yet.</p>`;
    $$("#img-tray [data-rm]").forEach(b=>b.addEventListener("click", e=>{
      e.stopPropagation(); EDIT_IMAGES.splice(Number(b.dataset.rm),1); drawPartTray();
    }));
    $$("#img-tray .img-cell").forEach(cell=>cell.addEventListener("click", ()=>{
      const i = Number(cell.dataset.i);
      if(i>0){ EDIT_IMAGES.unshift(EDIT_IMAGES.splice(i,1)[0]); drawPartTray(); }
    }));
  };
  drawPartTray();

  $("#pt-addplaceholder").addEventListener("click", ()=>{ EDIT_IMAGES.push({category:val("#pt-cat")}); drawPartTray(); });
  const up = $("#pt-upload");
  if(up) up.addEventListener("change", async e=>{
    const files = Array.from(e.target.files||[]);
    for(const f of files){
      try{ const assetId = await DB.upload(f); EDIT_IMAGES.push({assetId}); drawPartTray(); }
      catch(err){ toast("Upload failed. Try a smaller PNG or JPEG.", true); }
    }
    e.target.value = ""; toast("Images added");
  });

  $("#part-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#pt-save"); btn.disabled = true; btn.textContent = "Saving…";
    const base = slugify(val("#pt-sku") || val("#pt-name"));
    const newId = id || (DB.part(base) ? base + "-" + uid().slice(-4) : base);
    const data = {
      name:val("#pt-name"), sku:val("#pt-sku"), category:val("#pt-cat"), brand:val("#pt-brand"),
      price:num("#pt-price"), stock:num("#pt-stock"), unit:val("#pt-unit")||"pcs",
      compatible:val("#pt-compat").split(",").map(s=>s.trim()).filter(Boolean),
      description:val("#pt-desc"), status:val("#pt-status"), featured:$("#pt-feat").checked,
      images:EDIT_IMAGES.slice(), createdAt:(p&&p.createdAt)||todayISO()
    };
    try{
      await DB.put("parts", newId, data);
      const costVal = num("#pt-cost");
      if(costVal > 0) await DB.put("partcost", newId, {cost:costVal, updatedAt:todayISO()});
      if(!p && costVal > 0 && data.stock > 0) await Ledger.post(`Opening stock — ${data.name}`, newId,
        [{account:"1210", debit:costVal*data.stock, credit:0}, {account:"2000", debit:0, credit:costVal*data.stock}]);
      Audit.log(p?"UPDATE":"CREATE", "part", newId, p||null, data, "");
      closeModal(); toast(p?"Part saved":"Part added"); refreshAdmin();
    }catch(err){
      btn.disabled = false; btn.textContent = p?"Save changes":"Add part";
      toast("Save failed. Try again.", true);
    }
  });
}

function carForm(id){
  const c = id ? DB.car(id) : null;
  const v = Object.assign({
    model:"", variant:"", year:new Date().getFullYear()-6, price:"", mileage:"",
    engine:"", transmission:"Lineartronic CVT", fuel:"Petrol", drive:"Symmetrical AWD",
    body:"SUV", extColor:"", intColor:"", regYear:"", description:"",
    features:[], images:[], status:"AVAILABLE", featured:false
  }, c || {});
  EDIT_IMAGES = (v.images||[]).slice();

  openModal(`<div class="modal-head">
      <div><span class="tag">${c?"Edit vehicle":"New vehicle"}</span>
        <h3 class="h-2" style="margin-top:10px">${c?esc(v.model+" "+(v.variant||"")):"Add a Subaru"}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>
    <form id="car-form" class="form-grid">
      <div class="field"><label for="v-make">Make</label><input id="v-make" value="SUBARU" readonly></div>
      <div class="field"><label for="v-model">Model *</label><input id="v-model" required value="${esc(v.model)}" placeholder="Forester"></div>
      <div class="field"><label for="v-variant">Variant</label><input id="v-variant" value="${esc(v.variant||"")}" placeholder="XT"></div>
      <div class="field"><label for="v-year">Year *</label><input id="v-year" type="number" required min="1980" max="2030" value="${esc(v.year)}"></div>
      <div class="field"><label for="v-price">Price (KSh) *</label><input id="v-price" type="number" required min="0" step="10000" value="${esc(v.price)}"></div>
      <div class="field"><label for="v-mileage">Mileage (KM)</label><input id="v-mileage" type="number" min="0" value="${esc(v.mileage)}"></div>
      <div class="field"><label for="v-engine">Engine</label><input id="v-engine" value="${esc(v.engine)}" placeholder="2.0L FA20 turbocharged boxer"></div>
      <div class="field"><label for="v-trans">Transmission</label><input id="v-trans" value="${esc(v.transmission)}"></div>
      <div class="field"><label for="v-fuel">Fuel</label><input id="v-fuel" value="${esc(v.fuel)}"></div>
      <div class="field"><label for="v-drive">Drive type</label><input id="v-drive" value="${esc(v.drive)}"></div>
      <div class="field"><label for="v-body">Body type</label>
        <select id="v-body">${BODIES.map(b=>`<option ${v.body===b?"selected":""}>${b}</option>`).join("")}</select></div>
      <div class="field"><label for="v-ext">Exterior colour</label><input id="v-ext" value="${esc(v.extColor)}"></div>
      <div class="field"><label for="v-int">Interior colour</label><input id="v-int" value="${esc(v.intColor)}"></div>
      <div class="field"><label for="v-reg">Registration year</label><input id="v-reg" type="number" min="1980" max="2030" value="${esc(v.regYear||"")}"></div>
      <div class="field"><label for="v-status">Status</label>
        <select id="v-status">
          <option value="AVAILABLE" ${v.status==="AVAILABLE"?"selected":""}>Available</option>
          <option value="SOLD" ${v.status==="SOLD"?"selected":""}>Sold</option>
        </select></div>
      <div class="field" style="justify-content:flex-end">
        <label class="tick" style="margin-bottom:10px"><input type="checkbox" id="v-feat" ${v.featured?"checked":""}> Feature on the homepage</label></div>

      <div class="field full"><label for="v-desc">Description</label>
        <textarea id="v-desc" placeholder="What makes this particular car worth buying?">${esc(v.description)}</textarea></div>

      <div class="field full"><label>Features shown on the vehicle page</label>
        <div class="feat-picker" id="feat-picker">
          ${COMMON_FEATURES.map(f=>`<button type="button" class="chip ${(v.features||[]).includes(f)?"on":""}" data-feat="${esc(f)}">${esc(f)}</button>`).join("")}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="v-newfeat" placeholder="Add a custom feature">
          <button type="button" class="mini" id="v-addfeat">Add</button>
        </div>
        <p class="muted" style="font-size:.78rem;margin:8px 0 0">Only the features you select appear on the page.</p>
      </div>

      <div class="field full"><label>Images</label>
        <div class="img-tray" id="img-tray"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center">
          ${DB.assets?`<label class="mini" style="cursor:pointer">Upload photos
            <input id="v-upload" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>`
          :``}
          <select id="v-scene-env" style="width:auto;background:var(--ink);border:1px solid var(--rule);padding:7px 10px;font-size:.78rem">
            ${ENV_KEYS.map(k=>`<option value="${k}">${esc(ENVS[k].name)}</option>`).join("")}</select>
          <select id="v-scene-kind" style="width:auto;background:var(--ink);border:1px solid var(--rule);padding:7px 10px;font-size:.78rem">
            ${KINDS.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select>
          <button type="button" class="mini" id="v-addscene">Add placeholder</button>
        </div>
        <p class="muted" style="font-size:.78rem;margin:10px 0 0">The first image is the cover. Click an image to make it the cover.</p>
      </div>

      <div class="full btn-row" style="margin-top:8px;justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="v-save">${c?"Save changes":"Add vehicle"}</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  drawTray();

  $$("#feat-picker .chip").forEach(b=>b.addEventListener("click", ()=>b.classList.toggle("on")));
  $("#v-addfeat").addEventListener("click", ()=>{
    const val = $("#v-newfeat").value.trim(); if(!val) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip on"; b.dataset.feat = val; b.textContent = val;
    b.addEventListener("click", ()=>b.classList.toggle("on"));
    $("#feat-picker").appendChild(b); $("#v-newfeat").value = "";
  });
  $("#v-addscene").addEventListener("click", ()=>{
    EDIT_IMAGES.push({kind:$("#v-scene-kind").value, env:$("#v-scene-env").value});
    drawTray();
  });
  const up = $("#v-upload");
  if(up) up.addEventListener("change", async e=>{
    const files = Array.from(e.target.files || []);
    if(!files.length) return;
    toast("Uploading " + files.length + " image" + (files.length>1?"s":"") + "…");
    for(const f of files){
      try{
        const assetId = await DB.upload(f);
        EDIT_IMAGES.push({assetId}); drawTray();
      }catch(err){
        const c2 = err && err.code;
        toast(c2==="too_large" ? "That image is over 20 MB. Compress it and try again."
            : c2==="unsupported_type" ? "Use a PNG, JPEG or WebP file."
            : "Upload failed. Try again.", true);
      }
    }
    e.target.value = "";
    toast("Images added");
  });

  $("#car-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#v-save"); btn.disabled = true; btn.textContent = "Saving…";
    const status = $("#v-status").value;
    const prev = c || {};
    const data = {
      make:"SUBARU",
      model:$("#v-model").value.trim(), variant:$("#v-variant").value.trim(),
      year:Number($("#v-year").value), price:Number($("#v-price").value),
      mileage:Number($("#v-mileage").value)||0,
      engine:$("#v-engine").value.trim(), transmission:$("#v-trans").value.trim(),
      fuel:$("#v-fuel").value.trim(), drive:$("#v-drive").value.trim(),
      body:$("#v-body").value, extColor:$("#v-ext").value.trim(), intColor:$("#v-int").value.trim(),
      regYear:$("#v-reg").value?Number($("#v-reg").value):null,
      description:$("#v-desc").value.trim(),
      features:$$("#feat-picker .chip.on").map(b=>b.dataset.feat),
      images:EDIT_IMAGES.slice(),
      status, featured:$("#v-feat").checked,
      createdAt: prev.createdAt || new Date().toISOString(),
      soldAt: status === "SOLD" ? (prev.soldAt || new Date().toISOString()) : null
    };
    const newId = id || slugify(`subaru-${data.model}-${data.variant}-${data.year}`) + (DB.car(slugify(`subaru-${data.model}-${data.variant}-${data.year}`))?"-"+uid().slice(-4):"");
    try{
      await DB.put("cars", newId, data);
      closeModal(); toast(id?"Vehicle saved":"Vehicle added"); refreshAdmin();
    }catch(err){
      btn.disabled = false; btn.textContent = id?"Save changes":"Add vehicle";
      toast(err && err.code === "quota_exceeded" ? "The database is full. Delete an old vehicle first." : "Save failed. Try again.", true);
    }
  });
}

let EDIT_IMAGES = [];
function drawTray(){
  const tray = $("#img-tray"); if(!tray) return;
  const bodyType = $("#v-body") ? $("#v-body").value : "SUV";
  tray.innerHTML = EDIT_IMAGES.length ? EDIT_IMAGES.map((im,i)=>`
    <div class="img-cell" data-i="${i}" title="Click to make cover">
      ${media(im, "", bodyType, "tray"+i)}
      ${i===0?`<span class="cover-tag">Cover</span>`:""}
      <button type="button" data-rm="${i}" aria-label="Remove image">✕</button>
    </div>`).join("")
    : `<p class="muted" style="font-size:.82rem;margin:0">No images yet. Upload photos or add a placeholder.</p>`;
  $$("#img-tray [data-rm]").forEach(b=>b.addEventListener("click", e=>{
    e.stopPropagation(); EDIT_IMAGES.splice(Number(b.dataset.rm),1); drawTray();
  }));
  $$("#img-tray .img-cell").forEach(cell=>cell.addEventListener("click", ()=>{
    const i = Number(cell.dataset.i);
    if(i>0){ EDIT_IMAGES.unshift(EDIT_IMAGES.splice(i,1)[0]); drawTray(); }
  }));
}

function admStories(){
  const list = DB.allStories();
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <h3 class="h-3">The Journal (${list.length})</h3>
      <button class="btn btn--sm btn--solid" id="new-story">Write a story</button>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Title</th><th>Category</th><th>Author</th><th>Date</th><th>State</th><th>Actions</th></tr></thead>
      <tbody>${list.length?list.map(s=>`<tr>
        <td><a href="#/stories/${esc(s.id)}" style="color:var(--white)">${esc(s.title)}</a></td>
        <td>${esc(s.category||"—")}</td><td>${esc(s.author||"—")}</td><td>${dateLabel(s.date)}</td>
        <td><span class="pill ${s.published?"pill--ok":""}">${s.published?"Published":"Draft"}</span></td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="mini" data-sedit="${esc(s.id)}">Edit</button>
          <button class="mini" data-spub="${esc(s.id)}">${s.published?"Unpublish":"Publish"}</button>
          <button class="mini mini--danger" data-sdel="${esc(s.id)}">Delete</button>
        </div></td></tr>`).join("")
        :`<tr><td colspan="6" class="muted" style="padding:40px;text-align:center">No stories yet.</td></tr>`}
      </tbody></table></div>`;
}

function storyForm(id){
  const s = id ? DB.story(id) : null;
  const v = Object.assign({title:"",category:"Ownership",author:DB.s.dealership,excerpt:"",
    body:[], cover:{kind:"landscape",env:"ngong"}, published:false, date:new Date().toISOString()}, s||{});
  openModal(`<div class="modal-head">
      <div><span class="tag">${s?"Edit story":"New story"}</span>
        <h3 class="h-2" style="margin-top:10px">${s?esc(v.title):"Write a story"}</h3></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button>
    </div>
    <form id="story-form" class="form-grid">
      <div class="field full"><label for="s-title">Title *</label><input id="s-title" required value="${esc(v.title)}"></div>
      <div class="field"><label for="s-cat">Category</label><input id="s-cat" value="${esc(v.category)}" placeholder="Road Trips"></div>
      <div class="field"><label for="s-author">Author</label><input id="s-author" value="${esc(v.author)}"></div>
      <div class="field"><label for="s-date">Publication date</label><input id="s-date" type="date" value="${esc(String(v.date).slice(0,10))}"></div>
      <div class="field" style="justify-content:flex-end">
        <label class="tick" style="margin-bottom:10px"><input type="checkbox" id="s-pub" ${v.published?"checked":""}> Published</label></div>
      <div class="field full"><label for="s-ex">Excerpt</label><textarea id="s-ex" style="min-height:70px">${esc(v.excerpt)}</textarea></div>
      <div class="field full"><label for="s-body">Article</label>
        <textarea id="s-body" style="min-height:260px">${esc((v.body||[]).join("\n\n"))}</textarea>
        <p class="muted" style="font-size:.78rem;margin:8px 0 0">One paragraph per blank line. Start a line with ## for a heading.</p></div>
      <div class="field full"><label>Featured image</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <div class="img-cell" id="s-cover-prev" style="width:140px">${media(v.cover,"","SUV","cover")}</div>
          ${DB.assets?`<label class="mini" style="cursor:pointer">Upload image
            <input id="s-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>`:""}
          <select id="s-env" style="width:auto;background:var(--ink);border:1px solid var(--rule);padding:7px 10px;font-size:.78rem">
            ${ENV_KEYS.map(k=>`<option value="${k}" ${v.cover&&v.cover.env===k?"selected":""}>${esc(ENVS[k].name)}</option>`).join("")}</select>
          <select id="s-kind" style="width:auto;background:var(--ink);border:1px solid var(--rule);padding:7px 10px;font-size:.78rem">
            ${KINDS.map(([k,l])=>`<option value="${k}" ${v.cover&&v.cover.kind===k?"selected":""}>${l}</option>`).join("")}</select>
          <button type="button" class="mini" id="s-usescene">Use placeholder</button>
        </div></div>
      <div class="full btn-row" style="margin-top:8px;justify-content:space-between">
        <button class="btn btn--solid" type="submit" id="s-save">${s?"Save changes":"Create story"}</button>
        <button class="btn" type="button" onclick="closeModal()">Cancel</button>
      </div>
    </form>`, true);

  let cover = v.cover;
  const paint = ()=>{ $("#s-cover-prev").innerHTML = media(cover,"","SUV","cover"+Date.now()); };
  $("#s-usescene").addEventListener("click", ()=>{ cover = {kind:$("#s-kind").value, env:$("#s-env").value}; paint(); });
  const su = $("#s-upload");
  if(su) su.addEventListener("change", async e=>{
    const f = e.target.files[0]; if(!f) return;
    try{ cover = {assetId: await DB.upload(f)}; paint(); toast("Image uploaded"); }
    catch(err){ toast("Upload failed. Try a smaller PNG or JPEG.", true); }
  });

  $("#story-form").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = $("#s-save"); btn.disabled = true; btn.textContent = "Saving…";
    const title = $("#s-title").value.trim();
    const data = {
      title, category:$("#s-cat").value.trim(), author:$("#s-author").value.trim(),
      excerpt:$("#s-ex").value.trim(),
      body:$("#s-body").value.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean),
      cover, published:$("#s-pub").checked,
      date: $("#s-date").value ? new Date($("#s-date").value).toISOString() : new Date().toISOString()
    };
    try{
      await DB.put("stories", id || slugify(title) + (DB.story(slugify(title))?"-"+uid().slice(-4):""), data);
      closeModal(); toast(id?"Story saved":"Story created"); refreshAdmin();
    }catch(err){
      btn.disabled = false; btn.textContent = id?"Save changes":"Create story";
      toast("Save failed. Try again.", true);
    }
  });
}

function admInquiries(){
  const list = DB.allInquiries();
  const pillFor = s => s==="NEW"?"pill--new":s==="CONTACTED"?"pill--ok":"";
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px">
      <h3 class="h-3">Inquiries (${list.length})</h3>
      <span class="count">${list.filter(i=>i.status==="NEW").length} awaiting a reply</span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Customer</th><th>Contact</th><th>Vehicle</th><th>Message</th><th>Received</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${list.length?list.map(i=>`<tr>
        <td style="color:var(--white)">${esc(i.name)}</td>
        <td><a href="tel:${esc(String(i.phone).replace(/\s/g,""))}">${esc(i.phone)}</a>
          ${i.email?`<div class="muted" style="font-size:.76rem"><a href="mailto:${esc(i.email)}">${esc(i.email)}</a></div>`:""}</td>
        <td>${esc(i.carLabel||"—")}${i.price?`<div class="muted num" style="font-size:.76rem">${ksh(i.price)}</div>`:""}</td>
        <td style="max-width:280px">${esc(i.message||"—")}</td>
        <td class="muted" style="white-space:nowrap">${dateLabel(i.createdAt)}</td>
        <td><span class="pill ${pillFor(i.status)}">${esc(i.status||"NEW")}</span></td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <a class="mini" href="https://wa.me/${esc(String(i.phone).replace(/[^0-9]/g,"").replace(/^0/,"254"))}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="mini" data-istat="${esc(i.id)}" data-next="${i.status==="NEW"?"CONTACTED":i.status==="CONTACTED"?"CLOSED":"NEW"}">
            ${i.status==="NEW"?"Mark contacted":i.status==="CONTACTED"?"Close":"Reopen"}</button>
          <button class="mini mini--danger" data-idel="${esc(i.id)}">Delete</button>
        </div></td></tr>`).join("")
        :`<tr><td colspan="7" class="muted" style="padding:40px;text-align:center">No inquiries yet. They arrive here the moment a customer sends one.</td></tr>`}
      </tbody></table></div>`;
}

function admSettings(){
  const s = DB.s;
  const f = (id,label,val,type) => `<div class="field"><label for="${id}">${label}</label>
    <input id="${id}" type="${type||"text"}" value="${esc(val)}"></div>`;
  return `<h3 class="h-3" style="margin-bottom:20px">Site settings</h3>
    <form id="set-form" class="form-grid" style="max-width:920px">
      ${f("st-name","Dealership name",s.dealership)}
      ${f("st-wa","WhatsApp number (country code, digits only)",s.whatsapp)}
      ${f("st-phone","Phone",s.phone,"tel")}
      ${f("st-email","Email",s.email,"email")}
      ${f("st-addr","Location",s.address)}
      ${f("st-map","Maps link",s.mapUrl,"url")}
      <div class="field full"><label for="st-hours">Business hours</label><input id="st-hours" value="${esc(s.hours)}"></div>
      <div class="field full"><label for="st-tag">Tagline</label><input id="st-tag" value="${esc(s.tagline)}"></div>
      <div class="field"><label for="st-hero">Homepage headline</label><input id="st-hero" value="${esc(s.heroTitle)}"></div>
      <div class="field"><label for="st-herosub">Homepage subheading</label><input id="st-herosub" value="${esc(s.heroSub)}"></div>
      ${f("st-vat","VAT rate (%)", s.vatRate, "number")}
      ${f("st-pin","KRA PIN (printed on invoices)", s.pin)}
      <div class="field full"><label for="st-invnote">Invoice footer note</label><input id="st-invnote" value="${esc(s.invoiceNote)}"></div>
      <div class="field full"><label for="st-rcptnote">Receipt footer note</label><input id="st-rcptnote" value="${esc(s.receiptNote)}"></div>
      <div class="field full"><label for="st-about">About page opening</label><textarea id="st-about" style="min-height:90px">${esc(s.aboutLead)}</textarea></div>
      <div class="full btn-row"><button class="btn btn--solid" type="submit">Save settings</button></div>
      <p class="muted full" style="font-size:.8rem">The WhatsApp number is used by every "Chat on WhatsApp" button on the site, with the vehicle and its KSh price filled into the message.</p>
    </form>`;
}

function mountAdminLegacy(){
  $$("[data-go]").forEach(b=>b.addEventListener("click", ()=>{
    ADMIN_TAB = b.dataset.go;
    $$(".adm-tab").forEach(x=>x.classList.toggle("on", x.dataset.tab === ADMIN_TAB));
    refreshAdmin();
    if(ADMIN_TAB === "vehicles") setTimeout(()=>carForm(null), 80);
    if(ADMIN_TAB === "stories")  setTimeout(()=>storyForm(null), 80);
  }));
  const nc = $("#new-car"); if(nc) nc.addEventListener("click", ()=>carForm(null));
  const ns = $("#new-story"); if(ns) ns.addEventListener("click", ()=>storyForm(null));

  $$("[data-edit]").forEach(b=>b.addEventListener("click", ()=>carForm(b.dataset.edit)));
  $$("[data-sold]").forEach(b=>b.addEventListener("click", async ()=>{
    const c = DB.car(b.dataset.sold); if(!c) return;
    const sold = c.status !== "SOLD";
    await DB.patch("cars", c.id, {status: sold?"SOLD":"AVAILABLE",
      soldAt: sold ? new Date().toISOString() : null, featured: sold ? false : c.featured});
    toast(sold ? "Marked sold — removed from available inventory" : "Back in available inventory");
    refreshAdmin();
  }));
  $$("[data-feat]").forEach(b=>b.addEventListener("click", async ()=>{
    const c = DB.car(b.dataset.feat); if(!c) return;
    if(c.status === "SOLD") return toast("A sold vehicle can't be featured.", true);
    await DB.patch("cars", c.id, {featured: !c.featured});
    toast(c.featured?"Removed from the homepage":"Featured on the homepage"); refreshAdmin();
  }));
  $$("[data-del]").forEach(b=>b.addEventListener("click", ()=>{
    const c = DB.car(b.dataset.del); if(!c) return;
    confirmBox(`Delete ${c.year} Subaru ${c.model} ${c.variant||""}?`,
      "This removes the vehicle and its page for good.", async ()=>{
        await DB.remove("cars", c.id); toast("Vehicle deleted"); refreshAdmin();
      });
  }));

  $$("[data-sedit]").forEach(b=>b.addEventListener("click", ()=>storyForm(b.dataset.sedit)));
  $$("[data-spub]").forEach(b=>b.addEventListener("click", async ()=>{
    const s = DB.story(b.dataset.spub); if(!s) return;
    await DB.patch("stories", s.id, {published: !s.published});
    toast(s.published?"Unpublished":"Published"); refreshAdmin();
  }));
  $$("[data-sdel]").forEach(b=>b.addEventListener("click", ()=>{
    const s = DB.story(b.dataset.sdel); if(!s) return;
    confirmBox(`Delete "${s.title}"?`, "This removes the article for good.", async ()=>{
      await DB.remove("stories", s.id); toast("Story deleted"); refreshAdmin();
    });
  }));

  $$("[data-istat]").forEach(b=>b.addEventListener("click", async ()=>{
    await DB.patch("inquiries", b.dataset.istat, {status: b.dataset.next});
    toast("Inquiry updated"); refreshAdmin();
  }));
  $$("[data-idel]").forEach(b=>b.addEventListener("click", ()=>{
    confirmBox("Delete this inquiry?", "The customer's message will be removed.", async ()=>{
      await DB.remove("inquiries", b.dataset.idel); toast("Inquiry deleted"); refreshAdmin();
    });
  }));

  const sf = $("#set-form");
  if(sf) sf.addEventListener("submit", async e=>{
    e.preventDefault();
    await DB.saveSettings({
      dealership:$("#st-name").value.trim(), whatsapp:$("#st-wa").value.replace(/[^0-9]/g,""),
      phone:$("#st-phone").value.trim(), email:$("#st-email").value.trim(),
      address:$("#st-addr").value.trim(), mapUrl:$("#st-map").value.trim(),
      hours:$("#st-hours").value.trim(), tagline:$("#st-tag").value.trim(),
      heroTitle:$("#st-hero").value.trim(), heroSub:$("#st-herosub").value.trim(),
      vatRate:Number($("#st-vat").value)||0, pin:$("#st-pin").value.trim(),
      invoiceNote:$("#st-invnote").value.trim(), receiptNote:$("#st-rcptnote").value.trim(),
      aboutLead:$("#st-about").value.trim()
    });
    toast("Settings saved");
  });
}

function confirmBox(title, note, onYes){
  openModal(`<div class="modal-head"><div><h3 class="h-3">${esc(title)}</h3>
      <p class="muted" style="margin:10px 0 0;font-size:.9rem">${esc(note)}</p></div>
      <button class="x-btn" onclick="closeModal()" aria-label="Close">✕</button></div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn--solid" id="yes">Delete</button>
      <button class="btn" onclick="closeModal()">Keep it</button></div>`);
  $("#yes").addEventListener("click", async ()=>{ closeModal(); await onYes(); });
}


/* ---------- 14b. THE SCROLL ENGINE ----------
   One rAF loop. One source of time. Every pinned chapter, plane,
   rail and tile reads its progress from here — there is no second
   animation loop anywhere in the page.                            */
