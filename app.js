"use strict";

const DRAFT_KEY = "mali-receipt-draft-v1";
const money = new Intl.NumberFormat("th-TH", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const $ = id => document.getElementById(id);
let products = [];
let dirty = false;
let state = createState();

function pad(value) { return String(value).padStart(2, "0"); }
function createReceiptId(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function localIso(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
}
function createState() {
  const now = new Date();
  return {version: 1, receiptId: createReceiptId(now), customerName: "มะลิ", createdAt: localIso(now), items: [], note: ""};
}
function validNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function formatMoney(value) {
  const number = Number(value);
  return money.format(Number.isFinite(number) ? number : 0);
}
function sanitizeFileName(value) {
  return String(value || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, "_").slice(0, 60);
}
function calculateSummary() {
  let salesTotal = 0, paymentTotal = 0;
  for (const item of state.items) {
    const total = validNumber(item.quantity) * validNumber(item.unitPrice);
    if (item.type === "payment") paymentTotal += total;
    else salesTotal += total;
  }
  return {salesTotal, paymentTotal, balance: salesTotal - paymentTotal};
}
function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}
function showMessage(text = "") { $("message").textContent = text; }
function changed() {
  dirty = true;
  state.customerName = $("customerName").value;
  state.note = $("note").value;
  renderAll();
  saveDraftToLocalStorage();
}

async function loadProducts() {
  try {
    const response = await fetch("./products.json", {cache: "no-cache"});
    if (!response.ok) throw new Error();
    const data = await response.json();
    products = data.filter(validProduct).sort((a, b) => a.sort_order - b.sort_order);
    $("productStatus").textContent = `${products.length} รายการ`;
  } catch {
    $("productStatus").textContent = "โหลดรายการสินค้าไม่สำเร็จ";
  }
  renderProductList();
}
function validProduct(item) {
  return item && typeof item.id === "string" && typeof item.name === "string" &&
    ["sale", "payment"].includes(item.type) && Number.isFinite(Number(item.price)) && Number(item.price) >= 0;
}
function addProduct(product) {
  const existing = state.items.find(item => item.id === product.id);
  if (existing) existing.quantity += 1;
  else state.items.push({id: product.id, name: product.name, type: "sale", quantity: 1, unit: product.unit, unitPrice: validNumber(product.price), source: "product-list"});
  changed();
}
function updateQuantity(id, amount) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;
  item.quantity = Math.max(0, validNumber(item.quantity) + amount);
  if (item.quantity === 0) state.items = state.items.filter(entry => entry.id !== id);
  changed();
}
function addPayment(product, amount) {
  amount = validNumber(amount);
  if (!amount) return showMessage("กรุณากรอกยอดจ่ายไว้มากกว่า 0");
  state.items.push({id: `payment-${Date.now()}`, name: product.name, type: "payment", quantity: 1, unit: "บาท", unitPrice: amount, source: "product-list"});
  changed();
}
function addCustomItem(item) {
  state.items.push({...item, id: `custom-${Date.now()}`, source: "custom"});
  changed();
}
function removeItem(id) {
  state.items = state.items.filter(item => item.id !== id);
  changed();
}

function renderProductList() {
  $("productList").replaceChildren(...products.map(product => {
    const info = el("div", {}, [
      el("div", {className: "product-name", text: product.name}),
      el("div", {className: "muted", text: product.type === "payment" ? "กรอกยอดที่จ่ายไว้" : `${formatMoney(product.price)} บาท / ${product.unit}`})
    ]);
    if (product.type === "payment") {
      const input = el("input", {type: "number", min: "0", step: "0.01", placeholder: "จำนวนเงิน", "aria-label": `จำนวนเงิน ${product.name}`});
      const add = el("button", {type: "button", text: "เพิ่ม", onclick: () => { addPayment(product, input.value); input.value = ""; }});
      return el("article", {className: "product-card"}, [info, el("div", {className: "stepper"}, [input, add])]);
    }
    const item = state.items.find(entry => entry.id === product.id);
    return el("article", {className: "product-card"}, [info, el("div", {className: "stepper"}, [
      el("button", {type: "button", text: "−", "aria-label": `ลด ${product.name}`, onclick: () => updateQuantity(product.id, -1)}),
      el("span", {className: "quantity", text: item?.quantity || 0}),
      el("button", {type: "button", text: "+", "aria-label": `เพิ่ม ${product.name}`, onclick: () => addProduct(product)})
    ])]);
  }));
}
function renderCurrentItems() {
  if (!state.items.length) return $("currentItems").replaceChildren(el("div", {className: "empty", text: "ยังไม่มีรายการ"}));
  $("currentItems").replaceChildren(...state.items.map(item => {
    const price = el("input", {className: "price-input", type: "number", min: "0", step: "0.01", value: item.unitPrice, "aria-label": `ราคา ${item.name}`});
    price.addEventListener("change", () => { item.unitPrice = validNumber(price.value); changed(); });
    const controls = [];
    if (item.type === "sale") controls.push(el("div", {className: "stepper"}, [
      el("button", {type: "button", text: "−", onclick: () => updateQuantity(item.id, -1)}),
      el("span", {className: "quantity", text: item.quantity}),
      el("button", {type: "button", text: "+", onclick: () => updateQuantity(item.id, 1)})
    ]));
    controls.push(price);
    if (item.source === "custom") controls.push(el("button", {type: "button", className: "small-button secondary", text: "แก้ไข", onclick: () => openItemDialog(item)}));
    controls.push(el("button", {type: "button", className: "small-button danger", text: "ลบ", onclick: () => removeItem(item.id)}));
    return el("article", {className: "item-row"}, [
      el("div", {}, [el("div", {className: "product-name", text: item.name}), el("div", {className: `muted ${item.type}`, text: item.type === "payment" ? `−${formatMoney(item.unitPrice)} บาท` : `${item.quantity} ${item.unit} × ${formatMoney(item.unitPrice)}`})]),
      el("div", {className: "item-controls"}, controls)
    ]);
  }));
}
function receiptHeader() {
  const date = new Date(state.createdAt);
  return el("div", {className: "preview-head"}, [
    el("div", {}, [el("h3", {text: "ใบสรุปรายการ"}), el("div", {text: state.customerName || "ไม่ระบุชื่อลูกค้า"})]),
    el("div", {}, [el("div", {text: `เลขที่ ${state.receiptId}`}), el("div", {text: date.toLocaleString("th-TH", {dateStyle: "medium", timeStyle: "short"})})])
  ]);
}
function makeTable(items, className = "preview-table", start = 0) {
  const table = el("table", {className});
  table.append(el("thead", {}, [el("tr", {}, ["#","รายการ","จำนวน","ราคา/หน่วย","จำนวนเงิน"].map(text => el("th", {text}))) ]));
  const body = el("tbody");
  items.forEach((item, index) => {
    const total = validNumber(item.quantity) * validNumber(item.unitPrice);
    body.append(el("tr", {}, [
      el("td", {text: start + index + 1}), el("td", {}, [el("span", {className: "item-name", text: item.name})]),
      el("td", {text: item.type === "payment" ? "1" : `${item.quantity} ${item.unit}`}),
      el("td", {text: formatMoney(item.unitPrice)}),
      el("td", {className: item.type, text: `${item.type === "payment" ? "−" : ""}${formatMoney(total)}`})
    ]));
  });
  table.append(body);
  return table;
}
function summaryNode(className = "summary") {
  const summary = calculateSummary();
  return el("div", {className}, [
    summaryLine("ยอดสินค้ารวม", formatMoney(summary.salesTotal)),
    summaryLine("จ่ายไว้รวม", `−${formatMoney(summary.paymentTotal)}`, "payment"),
    summaryLine("ยอดคงเหลือ", formatMoney(summary.balance), `balance ${summary.balance < 0 ? "payment" : "sale"}`)
  ]);
}
function summaryLine(label, value, className = "") {
  return el("div", {className}, [el("span", {text: label}), el("span", {text: value})]);
}
function renderReceipt() {
  $("receiptPreview").replaceChildren(receiptHeader(), makeTable(state.items), summaryNode(), el("p", {text: state.note ? `หมายเหตุ: ${state.note}` : ""}));
}
function renderAll() {
  renderProductList();
  renderCurrentItems();
  renderReceipt();
}

function openItemDialog(item = null, payment = false) {
  $("itemForm").reset();
  $("editItemId").value = item?.id || "";
  $("dialogTitle").textContent = item ? "แก้ไขรายการ" : payment ? "เพิ่มรายการจ่ายไว้" : "เพิ่มรายการอื่น";
  $("itemName").value = item?.name || (payment ? "จ่ายไว้เพิ่มเติม" : "");
  $("itemQuantity").value = item?.quantity || 1;
  $("itemUnit").value = item?.unit || (payment ? "บาท" : "ชิ้น");
  $("itemPrice").value = item?.unitPrice || "";
  $("itemType").value = item?.type || (payment ? "payment" : "sale");
  $("itemDialog").showModal();
}
function submitItem(event) {
  event.preventDefault();
  const item = {
    name: $("itemName").value.trim(), type: $("itemType").value,
    quantity: validNumber($("itemQuantity").value), unit: $("itemUnit").value.trim(),
    unitPrice: validNumber($("itemPrice").value)
  };
  if (!item.name || !item.unit || item.quantity <= 0 || !["sale","payment"].includes(item.type)) return showMessage("กรุณากรอกข้อมูลให้ถูกต้อง");
  if (item.type === "payment") item.quantity = 1;
  const existing = state.items.find(entry => entry.id === $("editItemId").value);
  if (existing) Object.assign(existing, item);
  else addCustomItem(item);
  $("itemDialog").close();
  if (existing) changed();
}

function saveDraftToLocalStorage() {
  if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}
function restoreDraft() {
  try {
    state = validateReceipt(JSON.parse(localStorage.getItem(DRAFT_KEY)));
    dirty = true;
    syncFields();
    renderAll();
  } catch { localStorage.removeItem(DRAFT_KEY); }
  $("draftDialog").close();
}
function createNewReceipt(confirmFirst = true) {
  if (confirmFirst && !confirm("เริ่มใบใหม่และทิ้งข้อมูลใบปัจจุบันหรือไม่")) return;
  localStorage.removeItem(DRAFT_KEY);
  state = createState();
  dirty = false;
  syncFields();
  renderAll();
  showMessage("");
}
function clearItems() {
  if (!confirm("ล้างรายการทั้งหมดในใบนี้หรือไม่")) return;
  state.items = [];
  changed();
}
function syncFields() {
  $("customerName").value = state.customerName;
  $("note").value = state.note;
}

function validateReceipt(data) {
  if (!data || data.version !== 1 || typeof data.receiptId !== "string" || typeof data.createdAt !== "string" || !Array.isArray(data.items)) throw new Error();
  const items = data.items.map((item, index) => {
    if (!item || typeof item.name !== "string" || !["sale","payment"].includes(item.type)) throw new Error();
    const quantity = validNumber(item.quantity), unitPrice = validNumber(item.unitPrice);
    if (quantity <= 0 || (item.type === "sale" && !item.unit)) throw new Error();
    return {id: typeof item.id === "string" ? item.id : `import-${index}`, name: item.name, type: item.type, quantity: item.type === "payment" ? 1 : quantity, unit: String(item.unit || "บาท"), unitPrice, source: item.source === "product-list" ? "product-list" : "custom"};
  });
  if (Number.isNaN(Date.parse(data.createdAt))) throw new Error();
  return {version: 1, receiptId: data.receiptId, customerName: String(data.customerName || ""), createdAt: data.createdAt, items, note: String(data.note || "")};
}
async function importReceiptFromJson(file) {
  try {
    state = validateReceipt(JSON.parse(await file.text()));
    dirty = true;
    syncFields();
    renderAll();
    saveDraftToLocalStorage();
    showMessage("เปิดใบเก่าเรียบร้อย");
  } catch {
    showMessage("ไฟล์ JSON ไม่ถูกต้องหรือไม่รองรับ");
  } finally {
    $("jsonFile").value = "";
  }
}
function exportReceiptToJson() {
  const summary = calculateSummary();
  const data = {...state, updatedAt: localIso(), items: state.items.map(item => ({...item, total: validNumber(item.quantity) * validNumber(item.unitPrice)})), summary};
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], {type: "application/json;charset=utf-8"}), fileBase() + ".json");
}
function fileBase() {
  const customer = sanitizeFileName(state.customerName);
  return `receipt_${state.receiptId}${customer ? `_${customer}` : ""}`;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el("a", {href: url, download: name});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildExportPages() {
  const perPage = state.items.length <= 10 ? 10 : state.items.length <= 14 ? 14 : 18;
  const mode = perPage === 18 ? "dense" : perPage === 14 ? "compact" : "";
  const chunks = state.items.length ? Array.from({length: Math.ceil(state.items.length / perPage)}, (_, index) => state.items.slice(index * perPage, (index + 1) * perPage)) : [[]];
  return chunks.map((items, pageIndex) => {
    const created = new Date(state.createdAt);
    const header = el("header", {className: "export-header"}, [
      el("div", {}, [el("h2", {text: "ใบสรุปรายการ"}), el("p", {text: `ลูกค้า: ${state.customerName || "ไม่ระบุ"}`})]),
      el("div", {className: "export-id"}, [el("p", {text: `เลขที่ ${state.receiptId}`}), el("p", {text: created.toLocaleString("th-TH", {dateStyle:"medium",timeStyle:"short"})}), el("p", {text: `หน้า ${pageIndex + 1}/${chunks.length}`})])
    ]);
    const body = el("div", {className: "export-body"}, [makeTable(items, "export-table", pageIndex * perPage)]);
    const footer = el("footer", {className: "export-footer"}, [
      el("div", {className: "export-note", text: state.note ? `หมายเหตุ: ${state.note}` : ""}),
      summaryNode("export-summary")
    ]);
    return el("section", {className: `export-page ${mode}`}, [header, body, footer]);
  });
}
async function exportReceiptToPng() {
  if (typeof html2canvas !== "function") return showMessage("ยังโหลดเครื่องมือสร้างรูปไม่สำเร็จ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่");
  const button = $("pngBtn");
  button.disabled = true;
  showMessage("กำลังสร้างรูป...");
  try {
    const pages = buildExportPages();
    $("exportArea").replaceChildren(...pages);
    await document.fonts.ready;
    for (let index = 0; index < pages.length; index++) {
      const canvas = await html2canvas(pages[index], {scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false});
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      const suffix = pages.length > 1 ? `_page${index + 1}` : "";
      downloadBlob(blob, `${fileBase()}${suffix}.png`);
    }
    showMessage(`บันทึก PNG ${pages.length} หน้าเรียบร้อย (1080 × 1350 พิกเซล)`);
  } catch {
    showMessage("สร้างรูป PNG ไม่สำเร็จ กรุณาลองใหม่");
  } finally {
    $("exportArea").replaceChildren();
    button.disabled = false;
  }
}

function bindEvents() {
  $("customerName").addEventListener("input", changed);
  $("note").addEventListener("input", changed);
  $("newReceiptBtn").addEventListener("click", () => createNewReceipt(true));
  $("clearBtn").addEventListener("click", clearItems);
  $("addCustomBtn").addEventListener("click", () => openItemDialog());
  $("addPaymentBtn").addEventListener("click", () => openItemDialog(null, true));
  $("itemForm").addEventListener("submit", submitItem);
  document.querySelector("[data-close]").addEventListener("click", () => $("itemDialog").close());
  $("openBtn").addEventListener("click", () => $("jsonFile").click());
  $("jsonFile").addEventListener("change", event => event.target.files[0] && importReceiptFromJson(event.target.files[0]));
  $("jsonBtn").addEventListener("click", exportReceiptToJson);
  $("pngBtn").addEventListener("click", exportReceiptToPng);
  $("restoreDraftBtn").addEventListener("click", restoreDraft);
  $("discardDraftBtn").addEventListener("click", () => { localStorage.removeItem(DRAFT_KEY); $("draftDialog").close(); createNewReceipt(false); });
}

async function init() {
  bindEvents();
  syncFields();
  renderAll();
  await loadProducts();
  if (localStorage.getItem(DRAFT_KEY)) $("draftDialog").showModal();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
}

function selfCheck() {
  const original = state;
  state = {...createState(), items: [
    {type: "sale", quantity: 2, unitPrice: 50},
    {type: "payment", quantity: 1, unitPrice: 30}
  ]};
  const result = calculateSummary();
  console.assert(result.salesTotal === 100 && result.paymentTotal === 30 && result.balance === 70, "summary calculation failed");
  console.assert(formatMoney(-30).startsWith("-"), "negative money formatting failed");
  console.assert(!/[\\/:]/.test(sanitizeFileName("ร้าน/a:1")), "filename sanitizing failed");
  state = original;
}

selfCheck();
init();
