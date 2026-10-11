/* =====================================================
   DUITIE - dialog bertema (pengganti alert / confirm / prompt bawaan browser)
   Dialog.alert(pesan)            -> Promise<void>
   Dialog.confirm(pesan, opsi)    -> Promise<boolean>
   Dialog.form({title, fields})   -> Promise<object|null>
   Dialog.prompt(pesan, nilai)    -> Promise<string|null>
   window.alert otomatis memakai dialog ini.
===================================================== */
(function () {
    "use strict";

    const css = `
.dlg-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(43,37,80,.5);backdrop-filter:blur(4px);animation:dlg-fade .18s ease-out}
.dlg{width:100%;max-width:400px;max-height:calc(100vh - 40px);overflow:auto;padding:24px 22px 20px;border-radius:22px;
  background:linear-gradient(180deg,#fdfbff 0%,#f3eeff 100%);border:1.5px solid rgba(176,150,240,.55);
  box-shadow:0 18px 50px rgba(60,40,140,.35);font-family:"Plus Jakarta Sans",Fredoka,system-ui,sans-serif;color:#2b2550;
  animation:dlg-pop .2s cubic-bezier(.2,.9,.3,1.2)}
.dlg-icon{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:24px;font-weight:800;color:#fff;background:linear-gradient(135deg,#5b3fd1,#8366ea);box-shadow:0 6px 16px rgba(91,63,209,.35)}
.dlg.danger .dlg-icon{background:linear-gradient(135deg,#d6453d,#e8685a);box-shadow:0 6px 16px rgba(214,69,61,.35)}
.dlg h3{margin:0 0 6px;text-align:center;font-size:18px;font-weight:800;color:#3f1f9a}
.dlg p.dlg-msg{margin:0;text-align:center;font-size:14px;line-height:1.55;color:#4a4270;white-space:pre-line;word-break:break-word}
.dlg label{display:block;margin:14px 0 4px;font-size:12px;font-weight:700;color:#5d5886}
.dlg input,.dlg select{width:100%;padding:11px 13px;font:inherit;font-size:15px;color:#2b2550;background:#fff;
  border:1.5px solid rgba(176,150,240,.7);border-radius:12px;outline:none;transition:.15s}
.dlg input:focus,.dlg select:focus{border-color:#6c5ce0;box-shadow:0 0 0 3px rgba(108,92,224,.18)}
.dlg-err{min-height:18px;margin:10px 0 0;font-size:12.5px;font-weight:600;color:#c0392b;text-align:center}
.dlg-actions{display:flex;gap:10px;margin-top:18px}
.dlg-actions button{flex:1;padding:12px;border:0;border-radius:14px;font:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:.15s}
.dlg-actions button:focus-visible{outline:3px solid rgba(108,92,224,.45);outline-offset:2px}
.dlg-cancel{background:#e7dffd;color:#4c2aa8}
.dlg-cancel:hover{background:#dcd0fb}
.dlg-ok{color:#fff;background:linear-gradient(135deg,#5b3fd1,#7b5ee6);box-shadow:0 6px 14px rgba(91,63,209,.3)}
.dlg.danger .dlg-ok{background:linear-gradient(135deg,#d6453d,#e8685a);box-shadow:0 6px 14px rgba(214,69,61,.3)}
.dlg-ok:hover{transform:translateY(-1px)}
.dlg-ok:disabled{opacity:.6;cursor:default;transform:none}
@keyframes dlg-fade{from{opacity:0}to{opacity:1}}
@keyframes dlg-pop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dlg-overlay,.dlg{animation:none}}`;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    // Bangun satu dialog. Mengembalikan Promise<hasil|null>.
    function show(o) {
        return new Promise((resolve) => {
            const prevFocus = document.activeElement;
            const overlay = el("div", "dlg-overlay");
            const form = el("form", "dlg" + (o.danger ? " danger" : ""));
            form.noValidate = true;
            form.setAttribute("role", o.fields ? "dialog" : "alertdialog");
            form.setAttribute("aria-modal", "true");

            form.appendChild(el("div", "dlg-icon", o.icon || (o.danger ? "!" : o.fields ? "✎" : "i")));
            form.appendChild(el("h3", "", o.title || "Duitie"));
            if (o.message) form.appendChild(el("p", "dlg-msg", o.message));

            const inputs = {};
            (o.fields || []).forEach((f) => {
                const label = el("label", "", f.label || f.name);
                label.htmlFor = "dlg-" + f.name;
                let input;
                if (f.type === "select") {
                    input = el("select");
                    (f.options || []).forEach((opt) => { const op = el("option", "", opt); op.value = opt; input.appendChild(op); });
                } else {
                    input = el("input");
                    input.type = f.type || "text";
                    if (f.placeholder) input.placeholder = f.placeholder;
                    ["min", "max", "step", "maxLength"].forEach((k) => { if (f[k] !== undefined) input[k] = f[k]; });
                    if (f.type === "number") input.inputMode = "decimal";
                    if (f.inputMode) input.inputMode = f.inputMode;
                    if (f.autocomplete) input.autocomplete = f.autocomplete;
                }
                input.id = "dlg-" + f.name;
                input.name = f.name;
                if (f.value !== undefined && f.value !== null) input.value = f.value;
                inputs[f.name] = input;
                form.append(label, input);
            });

            const err = el("div", "dlg-err");
            err.setAttribute("role", "alert");
            if (o.fields) form.appendChild(err);

            const actions = el("div", "dlg-actions");
            const cancel = el("button", "dlg-cancel", o.cancelText || "Batal");
            cancel.type = "button";
            const ok = el("button", "dlg-ok", o.okText || "OK");
            ok.type = "submit";
            if (!o.hideCancel) actions.appendChild(cancel);
            actions.appendChild(ok);
            form.appendChild(actions);
            overlay.appendChild(form);
            document.body.appendChild(overlay);

            const done = (val) => {
                document.removeEventListener("keydown", onKey, true);
                overlay.remove();
                if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* abaikan */ } }
                resolve(val);
            };
            const cancelVal = o.fields ? null : false;
            function onKey(e) {
                if (e.key === "Escape") { e.preventDefault(); done(o.hideCancel ? undefined : cancelVal); }
                else if (e.key === "Tab") {         // jaga fokus tetap di dalam dialog
                    const f = Array.from(form.querySelectorAll("input,select,button"));
                    const i = f.indexOf(document.activeElement);
                    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
                    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
                }
            }
            document.addEventListener("keydown", onKey, true);
            cancel.addEventListener("click", () => done(cancelVal));
            overlay.addEventListener("mousedown", (e) => { if (e.target === overlay && !o.hideCancel) done(cancelVal); });
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                if (!o.fields) return done(o.hideCancel ? undefined : true);
                const values = {};
                for (const f of o.fields) {
                    values[f.name] = inputs[f.name].value.trim();
                    if (f.required && !values[f.name]) { err.textContent = `${f.label || f.name} wajib diisi.`; inputs[f.name].focus(); return; }
                }
                const msg = o.validate ? o.validate(values) : null;
                if (msg) { err.textContent = msg; return; }
                done(values);
            });

            const first = o.fields ? form.querySelector("input,select") : ok;
            setTimeout(() => { if (first) { first.focus(); if (first.select && first.type !== "number") first.select(); } }, 30);
        });
    }

    const Dialog = {
        alert: (message, opts = {}) => show({ title: opts.title || "Pemberitahuan", message: String(message), hideCancel: true, okText: opts.okText || "Oke" }),
        confirm: (message, opts = {}) => show({
            title: opts.title || "Konfirmasi", message: String(message), danger: !!opts.danger,
            okText: opts.okText || "Ya", cancelText: opts.cancelText || "Batal"
        }),
        form: (opts) => show(opts),
        prompt: (message, value = "", opts = {}) => show({
            title: opts.title || "Ubah", message: opts.message, okText: opts.okText || "Simpan",
            fields: [{ name: "value", label: message, value, required: !!opts.required, maxLength: opts.maxLength }]
        }).then((r) => (r ? r.value : null))
    };

    window.Dialog = Dialog;
    window.alert = (m) => { Dialog.alert(m); };   // semua alert() lama jadi dialog bertema
})();
