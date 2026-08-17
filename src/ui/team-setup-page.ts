export const teamSetupPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EZPE Team Setup</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #edf1f4; font-synthesis: none; }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #edf1f4; }
    button, input, select { font: inherit; min-height: 40px; }
    button { border: 1px solid #aeb8c2; background: #ffffff; color: #17202a; cursor: pointer; border-radius: 6px; font-weight: 700; padding: 0 14px; }
    button:hover { background: #f4f7f9; border-color: #7d8995; }
    button.primary { background: #1565a7; border-color: #1565a7; color: #ffffff; }
    button.primary:hover { background: #0f548d; }
    button:disabled { cursor: wait; opacity: .6; }
    input, select { width: 100%; border: 1px solid #b9c3cc; border-radius: 5px; background: #ffffff; color: #17202a; padding: 7px 9px; }
    label { color: #4d5a66; font-size: 12px; font-weight: 750; }
    .app-header { min-height: 64px; background: #17202a; color: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 22px; border-bottom: 4px solid #d64d3f; }
    .brand { display: flex; align-items: baseline; gap: 12px; }
    .brand h1 { margin: 0; font-size: 22px; letter-spacing: 0; }
    .brand span { color: #c8d1d9; font-size: 13px; }
    .step-nav { display: grid; grid-template-columns: repeat(3, minmax(92px, 1fr)); width: min(460px, 55vw); border: 1px solid #63717d; border-radius: 6px; overflow: hidden; }
    .step { min-height: 36px; display: grid; place-items: center; color: #c8d1d9; font-size: 12px; font-weight: 800; border-right: 1px solid #63717d; }
    .step:last-child { border-right: 0; }
    .step.active { background: #ffffff; color: #17202a; }
    .step.done { color: #bde4c4; }
    main { width: min(1440px, 100%); margin: 0 auto; padding: 16px; }
    .page-heading { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 16px; align-items: end; padding-bottom: 10px; border-bottom: 2px solid #87939d; }
    .page-heading h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
    .page-heading p { margin: 4px 0 0; color: #586570; font-size: 13px; line-height: 1.4; }
    .field { display: grid; gap: 4px; min-width: 0; }
    .team-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 12px; }
    .pokemon-card { min-width: 0; background: #ffffff; border: 1px solid #c7d0d8; border-top: 4px solid #1565a7; border-radius: 7px; padding: 12px; }
    .opponent .pokemon-card { border-top-color: #d64d3f; }
    .card-heading { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 8px; align-items: end; margin-bottom: 9px; }
    .card-heading h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .form-grid .wide { grid-column: 1 / -1; }
    .move-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
    details { margin-top: 10px; border-top: 1px solid #dce2e7; padding-top: 8px; }
    summary { cursor: pointer; color: #46525d; font-size: 12px; font-weight: 800; }
    .stat-grid { display: grid; grid-template-columns: repeat(6, minmax(52px, 1fr)); gap: 5px; margin-top: 8px; }
    .stat-pair { display: grid; gap: 5px; }
    .stat-pair input { min-height: 34px; padding: 5px; text-align: center; }
    .team-summary { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 0 2px; }
    .summary-chip { border: 1px solid #a9bfd0; background: #eaf2f8; color: #224b69; border-radius: 999px; padding: 5px 10px; font-size: 12px; font-weight: 750; }
    .action-bar { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 0; background: rgba(237, 241, 244, .96); border-top: 1px solid #aeb8c2; }
    .actions { display: flex; gap: 8px; }
    .status { min-height: 20px; color: #52606c; font-size: 12px; white-space: pre-wrap; }
    .status.error { color: #a12622; font-weight: 700; }
    [hidden] { display: none !important; }
    @media (max-width: 1100px) { .team-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .app-header { align-items: start; padding: 11px 13px; }
      .brand span { display: none; }
      .step-nav { width: min(330px, 68vw); }
      main { padding: 10px; }
      .page-heading { grid-template-columns: 1fr; }
      .team-grid { grid-template-columns: 1fr; }
      .stat-grid { grid-template-columns: repeat(3, minmax(52px, 1fr)); }
      .action-bar { align-items: stretch; flex-direction: column; }
      .actions { width: 100%; }
      .actions button { flex: 1; }
    }
    @media (max-width: 480px) {
      .card-heading { grid-template-columns: 1fr; align-items: stretch; }
      .card-heading h3 { margin-bottom: 0; }
    }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="brand"><h1>EZPE</h1><span>Battle Setup</span></div>
    <nav class="step-nav" aria-label="Setup progress">
      <div class="step" id="step-player">1. Your team</div>
      <div class="step" id="step-opponent">2. Opponent</div>
      <div class="step" id="step-battle">3. Battle</div>
    </nav>
  </header>
  <main>
    <section id="player-view">
      <div class="page-heading">
        <div><h2>Your Champions team</h2><p>Enter the complete build and assign the four-Pokémon battle order.</p></div>
        <div class="field"><label for="regulation">Regulation</label><select id="regulation"></select></div>
      </div>
      <div class="team-grid" id="player-grid"></div>
      <div class="action-bar">
        <div class="status" id="player-status" aria-live="polite"></div>
        <div class="actions"><button class="primary" id="save-player">Save team and continue</button></div>
      </div>
    </section>
    <section class="opponent" id="opponent-view" hidden>
      <div class="page-heading">
        <div><h2>Opponent team preview</h2><p>Enter the visible species or battle form, gender, and the two opening positions.</p></div>
        <button id="edit-player">Edit your team</button>
      </div>
      <div class="team-summary" id="player-summary"></div>
      <div class="team-grid" id="opponent-grid"></div>
      <div class="action-bar">
        <div class="status" id="opponent-status" aria-live="polite"></div>
        <div class="actions"><button id="back-player">Back</button><button class="primary" id="start-battle">Start battle</button></div>
      </div>
    </section>
  </main>
  <datalist id="species-options"></datalist>
  <datalist id="ability-options"></datalist>
  <datalist id="item-options"></datalist>
  <datalist id="move-options"></datalist>
  <script>
    var catalog = null;
    var setupStatus = null;
    var statIds = ["hp", "atk", "def", "spa", "spd", "spe"];
    var battleRoles = [
      ["lead-left", "Lead left"], ["lead-right", "Lead right"],
      ["bench-1", "Bench 1"], ["bench-2", "Bench 2"], ["", "Not brought"]
    ];

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function field(labelText, control, className) {
      var wrapper = el("div", "field" + (className ? " " + className : ""));
      var label = el("label", "", labelText);
      label.htmlFor = control.id;
      wrapper.append(label, control);
      return wrapper;
    }

    function input(id, type, value, list) {
      var control = document.createElement("input");
      control.id = id;
      control.type = type || "text";
      control.value = value === undefined ? "" : value;
      if (list) control.setAttribute("list", list);
      return control;
    }

    function select(id, options, selected) {
      var control = document.createElement("select");
      control.id = id;
      options.forEach(function(entry) {
        var option = document.createElement("option");
        option.value = entry[0];
        option.textContent = entry[1];
        option.selected = entry[0] === selected;
        control.appendChild(option);
      });
      return control;
    }

    async function api(path, options) {
      var response = await fetch(path, Object.assign({ headers: { "content-type": "application/json" } }, options || {}));
      var body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      return body;
    }

    function readStored(key) {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch (_error) {
        localStorage.removeItem(key);
        return null;
      }
    }

    function canonical(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

    function setStatus(id, message, error) {
      var node = document.getElementById(id);
      node.textContent = message;
      node.className = "status" + (error ? " error" : "");
    }

    function populateDatalist(id, entries) {
      var list = document.getElementById(id);
      list.replaceChildren();
      entries.forEach(function(entry) {
        var option = document.createElement("option");
        option.value = entry.name;
        option.label = entry.id;
        list.appendChild(option);
      });
    }

    function findSpecies(value) {
      var id = canonical(value);
      return catalog.species.find(function(species) { return species.id === id || canonical(species.name) === id; });
    }

    function applySpeciesDefaults(prefix, index) {
      var species = findSpecies(document.getElementById(prefix + "-species-" + index).value);
      if (!species) return;
      var gender = document.getElementById(prefix + "-gender-" + index);
      var currentGender = gender.value;
      gender.replaceChildren();
      species.genderOptions.forEach(function(value) {
        var option = el("option", "", value === "M" ? "Male" : value === "F" ? "Female" : "Genderless");
        option.value = value;
        option.selected = value === currentGender;
        gender.appendChild(option);
      });
      if (prefix === "player") {
        var ability = document.getElementById("player-ability-" + index);
        if (!ability.value && species.abilityIds.length) ability.value = species.abilityIds[0];
      }
    }

    function renderPlayerCards(saved) {
      var grid = document.getElementById("player-grid");
      grid.replaceChildren();
      for (var index = 0; index < 6; index += 1) {
        var data = saved && saved.pokemon[index] ? saved.pokemon[index] : null;
        var card = el("article", "pokemon-card");
        var heading = el("div", "card-heading");
        heading.append(el("h3", "", "Pokémon " + (index + 1)));
        var roleDefault = index === 0 ? "lead-left" : index === 1 ? "lead-right" : index === 2 ? "bench-1" : index === 3 ? "bench-2" : "";
        var savedRole = saved ? roleForIndex(saved.battleOrder, index) : roleDefault;
        heading.append(field("Battle position", select("player-role-" + index, battleRoles, savedRole)));

        var form = el("div", "form-grid");
        var species = input("player-species-" + index, "text", data ? data.speciesId : "", "species-options");
        species.addEventListener("change", function(event) {
          applySpeciesDefaults("player", Number(event.currentTarget.id.split("-").pop()));
        });
        form.append(
          field("Species / battle form", species, "wide"),
          field("Nickname", input("player-nickname-" + index, "text", data ? data.nickname || "" : "")),
          field("Gender", select("player-gender-" + index, [["M", "Male"], ["F", "Female"], ["N", "Genderless"]], data ? data.gender : "M")),
          field("Ability", input("player-ability-" + index, "text", data ? data.abilityId : "", "ability-options")),
          field("Held item", input("player-item-" + index, "text", data ? data.itemId || "" : "", "item-options")),
          field("Nature / stat alignment", select("player-nature-" + index, catalog.natures.map(function(nature) { return [nature, nature]; }), data ? data.nature : "Serious")),
          field("Level", input("player-level-" + index, "number", data ? data.level : 50))
        );
        card.append(heading, form);

        var moves = el("div", "move-grid");
        for (var moveIndex = 0; moveIndex < 4; moveIndex += 1) {
          moves.append(field("Move " + (moveIndex + 1), input("player-move-" + index + "-" + moveIndex, "text", data && data.moveIds[moveIndex] ? data.moveIds[moveIndex] : "", "move-options")));
        }
        card.appendChild(moves);

        var details = document.createElement("details");
        details.appendChild(el("summary", "", "IVs and EVs"));
        var stats = el("div", "stat-grid");
        statIds.forEach(function(stat) {
          var pair = el("div", "stat-pair");
          var iv = input("player-iv-" + index + "-" + stat, "number", data ? data.ivs[stat] : 31);
          iv.min = "0"; iv.max = "31";
          var ev = input("player-ev-" + index + "-" + stat, "number", data ? data.evs[stat] : 0);
          ev.min = "0"; ev.max = "252";
          pair.append(field(stat.toUpperCase() + " IV", iv), field(stat.toUpperCase() + " EV", ev));
          stats.appendChild(pair);
        });
        details.appendChild(stats);
        card.appendChild(details);
        grid.appendChild(card);
      }
    }

    function roleForIndex(order, index) {
      if (!order) return "";
      var position = order.indexOf(index);
      return position === 0 ? "lead-left" : position === 1 ? "lead-right" : position === 2 ? "bench-1" : position === 3 ? "bench-2" : "";
    }

    function readStats(index, kind) {
      return Object.fromEntries(statIds.map(function(stat) {
        return [stat, Number(document.getElementById("player-" + kind + "-" + index + "-" + stat).value)];
      }));
    }

    function readPlayerSetup() {
      var pokemon = [];
      var sourceIndexes = [];
      for (var index = 0; index < 6; index += 1) {
        var speciesId = document.getElementById("player-species-" + index).value.trim();
        if (!speciesId) continue;
        sourceIndexes.push(index);
        pokemon.push({
          speciesId: speciesId,
          nickname: document.getElementById("player-nickname-" + index).value.trim() || undefined,
          gender: document.getElementById("player-gender-" + index).value,
          level: Number(document.getElementById("player-level-" + index).value),
          abilityId: document.getElementById("player-ability-" + index).value.trim(),
          itemId: document.getElementById("player-item-" + index).value.trim() || null,
          moveIds: [0, 1, 2, 3].map(function(moveIndex) { return document.getElementById("player-move-" + index + "-" + moveIndex).value.trim(); }).filter(Boolean),
          nature: document.getElementById("player-nature-" + index).value,
          ivs: readStats(index, "iv"),
          evs: readStats(index, "ev")
        });
      }
      var roleOrder = ["lead-left", "lead-right", "bench-1", "bench-2"];
      var battleOrder = roleOrder.map(function(role) {
        var sourceIndex = sourceIndexes.find(function(index) { return document.getElementById("player-role-" + index).value === role; });
        return sourceIndexes.indexOf(sourceIndex);
      });
      return { regulationId: document.getElementById("regulation").value, pokemon: pokemon, battleOrder: battleOrder };
    }

    function renderOpponentCards(saved) {
      var grid = document.getElementById("opponent-grid");
      grid.replaceChildren();
      for (var index = 0; index < 6; index += 1) {
        var data = saved && saved.pokemon[index] ? saved.pokemon[index] : null;
        var card = el("article", "pokemon-card");
        var heading = el("div", "card-heading");
        heading.append(el("h3", "", "Pokémon " + (index + 1)));
        var defaultRole = index === 0 ? "lead-left" : index === 1 ? "lead-right" : "";
        var savedRole = saved && saved.leadOrder ? (saved.leadOrder[0] === index ? "lead-left" : saved.leadOrder[1] === index ? "lead-right" : "") : defaultRole;
        heading.append(field("Opening position", select("opponent-role-" + index, [["lead-left", "Lead left"], ["lead-right", "Lead right"], ["", "Unknown reserve"]], savedRole)));
        var form = el("div", "form-grid");
        var species = input("opponent-species-" + index, "text", data ? data.speciesId : "", "species-options");
        species.addEventListener("change", function(event) { applySpeciesDefaults("opponent", Number(event.currentTarget.id.split("-").pop())); });
        form.append(
          field("Species / battle form", species, "wide"),
          field("Gender", select("opponent-gender-" + index, [["M", "Male"], ["F", "Female"], ["N", "Genderless"]], data ? data.gender : "M"), "wide")
        );
        card.append(heading, form);
        grid.appendChild(card);
      }
    }

    function readOpponentSetup() {
      var pokemon = [];
      var sourceIndexes = [];
      for (var index = 0; index < 6; index += 1) {
        var speciesId = document.getElementById("opponent-species-" + index).value.trim();
        if (!speciesId) continue;
        sourceIndexes.push(index);
        pokemon.push({ speciesId: speciesId, gender: document.getElementById("opponent-gender-" + index).value });
      }
      var leadOrder = ["lead-left", "lead-right"].map(function(role) {
        var sourceIndex = sourceIndexes.find(function(index) { return document.getElementById("opponent-role-" + index).value === role; });
        return sourceIndexes.indexOf(sourceIndex);
      });
      return { pokemon: pokemon, leadOrder: leadOrder };
    }

    function showStep(step) {
      var opponent = step === "opponent";
      document.getElementById("player-view").hidden = opponent;
      document.getElementById("opponent-view").hidden = !opponent;
      document.getElementById("step-player").className = "step " + (opponent ? "done" : "active");
      document.getElementById("step-opponent").className = "step " + (opponent ? "active" : "");
      document.getElementById("step-battle").className = "step";
    }

    function goPlayer() { history.pushState({}, "", "/setup/player"); showStep("player"); }

    document.getElementById("save-player").addEventListener("click", async function(event) {
      var button = event.currentTarget;
      button.disabled = true;
      setStatus("player-status", "Validating team...");
      try {
        var payload = readPlayerSetup();
        await api("/api/setup/player", { method: "POST", body: JSON.stringify(payload) });
        localStorage.setItem("ezpe-player-team", JSON.stringify(payload));
        setupStatus = await api("/api/setup/status");
        renderPlayerSummary();
        history.pushState({}, "", "/setup/opponent");
        showStep("opponent");
        setStatus("opponent-status", "Ready for team preview.");
      } catch (error) {
        setStatus("player-status", error.message, true);
      } finally { button.disabled = false; }
    });

    document.getElementById("start-battle").addEventListener("click", async function(event) {
      var button = event.currentTarget;
      button.disabled = true;
      setStatus("opponent-status", "Building battle state...");
      try {
        var payload = readOpponentSetup();
        await api("/api/setup/opponent", { method: "POST", body: JSON.stringify(payload) });
        localStorage.setItem("ezpe-opponent-team", JSON.stringify(payload));
        window.location.href = "/battle";
      } catch (error) {
        setStatus("opponent-status", error.message, true);
        button.disabled = false;
      }
    });

    function renderPlayerSummary() {
      var summary = document.getElementById("player-summary");
      summary.replaceChildren();
      setupStatus.playerPokemon.forEach(function(pokemon) {
        summary.appendChild(el("span", "summary-chip", pokemon.displayName || pokemon.speciesId));
      });
    }

    document.getElementById("edit-player").addEventListener("click", goPlayer);
    document.getElementById("back-player").addEventListener("click", goPlayer);
    window.addEventListener("popstate", function() { showStep(location.pathname.includes("opponent") ? "opponent" : "player"); });

    Promise.all([
      api("/api/setup/status"),
      api("/api/setup/catalog?regulationId=champions-m-b")
    ]).then(function(results) {
      setupStatus = results[0];
      catalog = results[1];
      var savedPlayer = readStored("ezpe-player-team");
      var savedOpponent = readStored("ezpe-opponent-team");
      var regulation = document.getElementById("regulation");
      catalog.regulations.forEach(function(entry) {
        var option = el("option", "", entry.name);
        option.value = entry.id;
        option.selected = entry.id === (savedPlayer?.regulationId || setupStatus.regulationId || catalog.defaultRegulationId);
        regulation.appendChild(option);
      });
      populateDatalist("species-options", catalog.species);
      populateDatalist("ability-options", catalog.abilities);
      populateDatalist("item-options", catalog.items);
      populateDatalist("move-options", catalog.moves);
      renderPlayerCards(savedPlayer);
      renderOpponentCards(savedOpponent);
      renderPlayerSummary();
      var wantsOpponent = location.pathname.includes("opponent");
      if (wantsOpponent && !setupStatus.playerConfigured) {
        history.replaceState({}, "", "/setup/player");
        wantsOpponent = false;
      }
      showStep(wantsOpponent ? "opponent" : "player");
    }).catch(function(error) {
      setStatus("player-status", error.message, true);
    });
  </script>
</body>
</html>`;
