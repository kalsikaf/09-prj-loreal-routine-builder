/* ---------- DOM ---------- */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const rtlToggle = document.getElementById("rtlToggle");

/* Modal refs */
const modal = document.getElementById("productModal");
const modalClose = document.getElementById("modalClose");
const modalImg = document.getElementById("modalImg");
const modalTitle = document.getElementById("modalTitle");
const modalBrand = document.getElementById("modalBrand");
const modalDesc = document.getElementById("modalDesc");

/* ---------- App State ---------- */
let allProducts = [];
let selectedIds = new Set(JSON.parse(localStorage.getItem("selectedIds") || "[]"));
let chatHistory = JSON.parse(localStorage.getItem("chatHistory") || "[]"); // {role, content}
let routineGenerated = JSON.parse(localStorage.getItem("routineGenerated") || "false");

/* Worker / API config:
   - Preferred: secrets.workerUrl points to your Cloudflare Worker endpoint (POST /chat)
   - Local dev: secrets.openaiKey (use only locally)
*/
const secrets = (typeof window.secrets !== "undefined") ? window.secrets : {};
const WORKER_URL = secrets.workerUrl || "";       // e.g., "https://your-worker.your-subdomain.workers.dev/chat"
const OPENAI_KEY = secrets.openaiKey || "";       // Local test only

/* ---------- UI Helpers ---------- */
function placeholderProducts() {
  productsContainer.innerHTML = `
    <div class="placeholder-message">Choose a category or use search to browse products</div>
  `;
}
function saveSelections() {
  localStorage.setItem("selectedIds", JSON.stringify([...selectedIds]));
}
function saveChat() {
  localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
  localStorage.setItem("routineGenerated", JSON.stringify(routineGenerated));
}
function appendMessage(role, content) {
  const msgEl = document.createElement("div");
  msgEl.className = `msg ${role}`;
  msgEl.innerHTML = `<div class="bubble">${content}</div>`;
  chatWindow.appendChild(msgEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function hydrateChat() {
  chatWindow.innerHTML = "";
  if (!chatHistory.length) {
    appendMessage("system", "Hi! Select products you love, generate a routine, then ask follow-ups.");
    return;
  }
  chatHistory.forEach(m => appendMessage(m.role === "assistant" ? "assistant" : "user", m.content));
}

/* ---------- Data ---------- */
async function loadProducts() {
  const res = await fetch("products.json");
  const data = await res.json();
  allProducts = data.products || [];
}

/* ---------- Render ---------- */
function cardTemplate(p) {
  const isSelected = selectedIds.has(p.id);
  return `
    <article class="product-card ${isSelected ? "selected" : ""}" data-id="${p.id}">
      <div class="product-media">
        <img src="${p.image}" alt="${p.name}"/>
      </div>
      <div class="product-info">
        <span class="badge">${p.category}</span>
        <h3>${p.name}</h3>
        <p class="brand">${p.brand}</p>
        <div class="product-actions">
          <button class="card-btn primary js-toggle-select" type="button">${isSelected ? "Unselect" : "Select"}</button>
          <button class="card-btn ghost js-details" type="button">Details</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const cat = (categoryFilter.value || "").trim().toLowerCase();
  const q = (productSearch.value || "").trim().toLowerCase();

  const list = allProducts.filter(p => {
    const catOk = !cat || p.category.toLowerCase() === cat;
    const text = `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase();
    const qOk = !q || text.includes(q);
    return catOk && qOk;
  });

  if (!list.length) {
    productsContainer.innerHTML = `<div class="placeholder-message">No matching products. Try a different search or category.</div>`;
    return;
  }

  productsContainer.innerHTML = list.map(cardTemplate).join("");
}

function renderSelectedChips() {
  const sel = allProducts.filter(p => selectedIds.has(p.id));
  selectedProductsList.innerHTML = sel.map(p => `
    <span class="chip" data-id="${p.id}">
      ${p.name} <button type="button" class="remove-chip" aria-label="Remove ${p.name}"><i class="fa-solid fa-xmark"></i></button>
    </span>
  `).join("");
}

/* ---------- Selection Logic ---------- */
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  saveSelections();
  renderProducts();
  renderSelectedChips();
}

/* ---------- Modal ---------- */
function openModal(p) {
  modalImg.src = p.image;
  modalImg.alt = p.name;
  modalTitle.textContent = p.name;
  modalBrand.textContent = p.brand;
  modalDesc.textContent = p.description;
  modal.showModal();
}
modalClose.addEventListener("click", () => modal.close());
modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });

/* ---------- Generate Routine ---------- */
function getSelectedProducts() {
  return allProducts.filter(p => selectedIds.has(p.id))
    .map(p => ({
      id: p.id, name: p.name, brand: p.brand, category: p.category, description: p.description
    }));
}

function guardTopic(text) {
  // allow only these verticals
  const allow = /(skin|skincare|cleanser|moistur|retinol|spf|suncare|acne|serum|hair|shampoo|conditioner|makeup|foundation|mascara|fragrance|perfume|lipstick)/i;
  return allow.test(text);
}

async function callWorker(messages, selected) {
  if (WORKER_URL) {
    const r = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ messages, selectedProducts: selected })
    });
    if (!r.ok) throw new Error(`Worker error ${r.status}`);
    const data = await r.json();
    return data.content;
  }

  if (!OPENAI_KEY) {
    throw new Error("No WORKER_URL or OPENAI_KEY found. Add one in secrets.js");
  }

  // Local dev only — call OpenAI directly (Responses API style)
  const r = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "You are a helpful beauty advisor. Use only the provided products and safe, general guidance. Avoid medical claims. Keep responses concise and actionable."
        },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        {
          role: "user",
          content: `Selected products JSON: ${JSON.stringify(selected, null, 2)}. Build a step-by-step routine (AM/PM if relevant), mention why each product fits, and include simple tips.`
        }
      ]
    })
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}`);
  const data = await r.json();
  // Responses API returns output in data.output_text for unified text
  return data.output_text || (data?.content?.[0]?.text ?? "Sorry, I couldn't generate a response.");
}

generateBtn.addEventListener("click", async () => {
  const selected = getSelectedProducts();
  if (!selected.length) {
    appendMessage("assistant", "Select at least one product first ✨");
    return;
  }
  appendMessage("assistant", "Crafting your routine…");
  try {
    const messages = chatHistory.length
      ? chatHistory
      : [{ role:"user", content:"Please create a routine from my selected products." }];

    const reply = await callWorker(messages, selected);
    routineGenerated = true;
    chatHistory.push({ role:"assistant", content: reply });
    saveChat();
    hydrateChat();           // re-render full chat so the “crafting…” note is replaced
    appendMessage("system", "Ask follow-ups about skincare, haircare, makeup, suncare, or fragrance.");
  } catch (err) {
    appendMessage("assistant", `There was a problem generating your routine: ${err.message}`);
  }
});

/* ---------- Chat ---------- */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  if (!guardTopic(text)) {
    appendMessage("assistant", "Let’s keep questions focused on skincare, haircare, makeup, suncare, or fragrance 😊");
    userInput.value = "";
    return;
  }

  const selected = getSelectedProducts();
  appendMessage("user", text);
  chatHistory.push({ role:"user", content:text });
  saveChat();
  userInput.value = "";

  try {
    const reply = await callWorker(chatHistory, selected);
    chatHistory.push({ role:"assistant", content: reply });
    saveChat();
    appendMessage("assistant", reply);
  } catch (err) {
    appendMessage("assistant", `Hmm, I hit a snag: ${err.message}`);
  }
});

/* ---------- Events: filters, grid, chips, clear, RTL ---------- */
categoryFilter.addEventListener("change", renderProducts);
productSearch.addEventListener("input", renderProducts);

productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;
  const id = Number(card.dataset.id);
  if (e.target.closest(".js-toggle-select")) {
    toggleSelect(id);
  } else if (e.target.closest(".js-details")) {
    const p = allProducts.find(x => x.id === id);
    if (p) openModal(p);
  } else {
    // clicking the whole card toggles select for nice UX
    toggleSelect(id);
  }
});

selectedProductsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-chip");
  if (!btn) return;
  const chip = btn.closest(".chip");
  const id = Number(chip.dataset.id);
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    saveSelections();
    renderSelectedChips();
    renderProducts();
  }
});

clearSelectionsBtn.addEventListener("click", () => {
  selectedIds.clear();
  saveSelections();
  renderSelectedChips();
  renderProducts();
});

rtlToggle.addEventListener("click", () => {
  const root = document.documentElement;
  const isRtl = root.getAttribute("dir") === "rtl";
  root.setAttribute("dir", isRtl ? "ltr" : "rtl");
  rtlToggle.setAttribute("aria-pressed", String(!isRtl));
  // Persist if you like:
  localStorage.setItem("rtl", String(!isRtl));
});

/* ---------- Init ---------- */
(async function init(){
  placeholderProducts();
  await loadProducts();
  // restore RTL pref
  const savedRtl = localStorage.getItem("rtl");
  if (savedRtl === "true") {
    document.documentElement.setAttribute("dir","rtl");
    rtlToggle.setAttribute("aria-pressed","true");
  }
  renderProducts();
  renderSelectedChips();
  hydrateChat();
})();