import { h, icon, toast, pickFiles } from "./ui.js";
import { byId } from "./tools.js";
import { defaults, renderOptions } from "./options.js";

const KEY = "pdf-atolye-workflows-v1";
const ALLOWED = ["compress", "rotate", "page_numbers", "grayscale", "flatten"];

export function mountWorkflows(el, { caps, upload, process, result, busy, idle }) {
  let steps = [{ tool: "page_numbers", options: defaults(byId.page_numbers.opts) }, { tool: "compress", options: defaults(byId.compress.opts) }];
  let saved = [];
  let running = false;
  let disposed = false;
  try { saved = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { /* empty storage */ }
  if (!Array.isArray(saved)) saved = [];
  saved = saved.filter(r => typeof r.name === "string" && Array.isArray(r.steps) && r.steps.length <= 8 && r.steps.every(s => ALLOWED.includes(s.tool) && s.options && typeof s.options === "object")).slice(0, 20);
  const name = h("input.input", { value: "Numarala ve sıkıştır", maxlength: 80, "aria-label": "İş akışı adı" });
  const picker = h("select.input", { "aria-label": "Eklenecek araç" }, ALLOWED.map(id => h("option", { value: id }, byId[id].name)));
  const list = h("div.workflow-steps");
  const savedBox = h("div.quick-tools");
  const controls = h("fieldset.workflow-controls");
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); return true; }
    catch { toast("Tarayıcı ayarları iş akışının kaydedilmesine izin vermiyor.", "err"); return false; }
  }
  function drawSaved() {
    savedBox.replaceChildren(...saved.map((recipe, index) => h("div.row",
      h("button.btn.sm", { type: "button", onclick: () => { name.value = recipe.name; steps = structuredClone(recipe.steps); draw(); } }, recipe.name),
      h("button.icon-btn", { type: "button", "aria-label": `${recipe.name} kaydını sil`, onclick: () => { saved.splice(index, 1); persist(); drawSaved(); } }, icon("trash-2")))));
  }
  function draw() {
    list.replaceChildren(...steps.map((step, index) => {
      const t = byId[step.tool];
      const options = renderOptions(t.opts || [], step.options, { caps });
      return h("section.workflow-step", h("div.row", h("h3.grow", `${index + 1}. ${t.name}`),
        h("button.btn.sm", { type: "button", disabled: index === 0, "aria-label": `${t.name} adımını yukarı taşı`, onclick: () => { [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; draw(); } }, "↑"),
        h("button.btn.sm", { type: "button", "aria-label": `${t.name} adımını kaldır`, onclick: () => { steps.splice(index, 1); draw(); } }, "Kaldır")), options.el);
    }));
  }
  controls.append(h("div.field", h("label", "Akış adı"), name), h("div.row", picker,
    h("button.btn", { type: "button", onclick: () => { if (steps.length >= 8) return toast("En fazla 8 adım eklenebilir.", "err"); steps.push({ tool: picker.value, options: defaults(byId[picker.value].opts) }); draw(); } }, "Adım ekle")), list,
    h("div.quick-tools", h("button.btn", { type: "button", onclick: () => {
      if (!steps.length || !name.value.trim()) return toast("Bir ad ve en az bir adım gerekli.", "err");
      const recipe = { name: name.value.trim(), steps: structuredClone(steps) };
      saved = [recipe, ...saved.filter(r => r.name !== recipe.name)].slice(0, 20);
      if (persist()) toast("İş akışı bu tarayıcıya kaydedildi."); drawSaved();
    } }, "Akışı kaydet"), h("button.btn.primary.big", { type: "button", onclick: async () => {
      if (running || !steps.length) return;
      const files = await pickFiles({ accept: ".pdf", multiple: false });
      if (!files.length || disposed) return;
      running = true; controls.disabled = true;
      const recipe = structuredClone(steps);
      try {
        const infos = await upload(files);
        if (!infos.length || disposed) return;
        let current = infos[0];
        let response;
        for (let i = 0; i < recipe.length; i++) {
          const step = recipe[i];
          busy(`${i + 1}/${recipe.length} · ${byId[step.tool].name}`, "Her adım bir öncekinin çıktısını kullanır.");
          response = await process(step.tool, [current.id], step.options);
          current = response.result;
          if (disposed) return;
        }
        idle(); result(byId[recipe.at(-1).tool], response);
      } catch (e) { toast(e.message, "err"); }
      finally { idle(); running = false; controls.disabled = false; }
    } }, icon("play"), "PDF seç ve akışı çalıştır")));
  el.append(h("h1", "İş akışları"), h("p", "Bir PDF'e sırayla birkaç işlem uygula. Adlar ve seçenekler bu tarayıcıda saklanır; PDF içeriği kayda eklenmez."), savedBox, controls);
  drawSaved(); draw();
  return () => { disposed = true; };
}
