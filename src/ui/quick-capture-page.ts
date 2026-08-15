export const quickCapturePage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EZPE Quick Capture</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #17202a;
      background: #edf1f4;
      font-synthesis: none;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #edf1f4; }
    button, input, select { font: inherit; }
    button, input, select { min-height: 40px; }
    button { border: 1px solid #aeb8c2; background: #ffffff; color: #17202a; cursor: pointer; border-radius: 6px; font-weight: 650; padding: 0 13px; }
    button:hover { background: #f4f7f9; border-color: #7d8995; }
    button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #9dc7ec; outline-offset: 1px; }
    button.primary { background: #1565a7; border-color: #1565a7; color: #ffffff; }
    button.primary:hover { background: #0f548d; }
    button.danger { color: #a12622; border-color: #d8a3a1; }
    button:disabled { cursor: wait; opacity: 0.6; }
    input, select { width: 100%; border: 1px solid #b9c3cc; border-radius: 5px; background: #ffffff; color: #17202a; padding: 7px 9px; }
    label { color: #4d5a66; font-size: 12px; font-weight: 700; }
    .app-header { min-height: 64px; background: #17202a; color: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 22px; border-bottom: 4px solid #d64d3f; }
    .brand { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
    .brand h1 { margin: 0; font-size: 22px; line-height: 1; letter-spacing: 0; }
    .brand span { color: #c8d1d9; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .connection { font-size: 12px; color: #bde4c4; white-space: nowrap; }
    main { width: min(1480px, 100%); margin: 0 auto; padding: 16px; }
    .topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 14px; margin-bottom: 14px; }
    .battle-meta { font-size: 14px; font-weight: 700; }
    .turn-control { display: grid; grid-template-columns: 84px 88px; gap: 8px; align-items: end; }
    .battle-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    .side-section { min-width: 0; }
    .section-heading { display: flex; align-items: center; justify-content: space-between; min-height: 38px; padding: 0 2px; border-bottom: 2px solid #87939d; }
    .section-heading h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
    .side-label { font-size: 11px; color: #5c6872; text-transform: uppercase; font-weight: 800; }
    .pokemon-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-top: 10px; }
    .pokemon-card { min-width: 0; background: #ffffff; border: 1px solid #c7d0d8; border-top: 4px solid #1565a7; border-radius: 7px; padding: 12px; }
    .opponent .pokemon-card { border-top-color: #d64d3f; }
    .pokemon-title { display: flex; align-items: start; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .pokemon-title h3 { margin: 0; font-size: 16px; letter-spacing: 0; overflow-wrap: anywhere; }
    .slot { flex: 0 0 auto; color: #65717c; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .control-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; margin-top: 8px; align-items: end; }
    .control-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 7px; margin-top: 8px; }
    .field { display: grid; gap: 4px; min-width: 0; }
    .hp-caption { font-size: 12px; color: #52606c; font-weight: 700; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; min-height: 25px; margin-top: 9px; }
    .chip { display: inline-flex; align-items: center; min-height: 25px; max-width: 100%; border: 1px solid #bdc7cf; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 750; overflow-wrap: anywhere; }
    .chip.observed { background: #e5f4e8; border-color: #8dc69a; color: #215f2f; }
    .chip.assumed { background: #fff5d8; border-color: #d7bd6a; color: #6a5312; }
    details { margin-top: 10px; border-top: 1px solid #dce2e7; padding-top: 8px; }
    summary { color: #46525d; cursor: pointer; font-size: 12px; font-weight: 800; }
    .advanced-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
    .boost-row { display: grid; grid-template-columns: minmax(0, 1fr) 72px auto; gap: 7px; margin-top: 8px; align-items: end; }
    .conditions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; padding-top: 10px; }
    .field-band { margin-top: 14px; padding: 13px 2px; border-top: 2px solid #87939d; border-bottom: 1px solid #b8c2cb; }
    .field-grid { display: grid; grid-template-columns: repeat(7, minmax(86px, 1fr)) auto; gap: 8px; align-items: end; }
    .advice-section { margin-top: 15px; }
    .rank-controls { display: grid; grid-template-columns: 90px 110px 130px; gap: 8px; align-items: end; }
    .advice-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-top: 10px; }
    .advice-card { background: #ffffff; border: 1px solid #c7d0d8; border-left: 5px solid #2d8a49; border-radius: 6px; padding: 12px; min-width: 0; }
    .advice-card h3 { margin: 0 0 7px; font-size: 14px; letter-spacing: 0; overflow-wrap: anywhere; }
    .score { color: #245b35; font-weight: 800; font-size: 13px; }
    .outcome { color: #4f5b66; font-size: 12px; line-height: 1.45; margin-top: 6px; }
    .status-line { min-height: 22px; color: #52606c; font-size: 12px; padding-top: 7px; }
    .status-line.error { color: #a12622; font-weight: 700; }
    @media (max-width: 1280px) {
      .pokemon-list { grid-template-columns: 1fr; }
    }
    @media (max-width: 980px) {
      .battle-grid { grid-template-columns: 1fr; }
      .field-grid { grid-template-columns: repeat(4, minmax(80px, 1fr)); }
      .advice-list { grid-template-columns: 1fr; }
    }
    @media (max-width: 620px) {
      .app-header { padding: 11px 13px; }
      .brand span { display: none; }
      main { padding: 10px; }
      .topbar { grid-template-columns: 1fr; }
      .pokemon-list { grid-template-columns: 1fr; }
      .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .rank-controls { grid-template-columns: 1fr 1fr; }
      .rank-controls button { grid-column: 1 / -1; }
    }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="brand"><h1>EZPE</h1><span>Quick Capture</span></div>
    <div class="connection" id="connection">Local session</div>
  </header>
  <main>
    <section class="topbar">
      <div class="battle-meta" id="battle-meta">Loading battle state...</div>
      <div class="turn-control">
        <div class="field"><label for="turn">Turn</label><input id="turn" type="number" min="1" max="999"></div>
        <button id="set-turn">Set turn</button>
      </div>
    </section>
    <div class="battle-grid" id="battle-grid"></div>
    <section class="field-band">
      <div class="section-heading"><h2>Field</h2><span class="side-label">Current conditions</span></div>
      <div class="field-grid">
        <div class="field"><label for="weather">Weather</label><select id="weather"><option value="">None</option><option>rain</option><option>sun</option><option>sandstorm</option><option>snow</option></select></div>
        <div class="field"><label for="weather-turns">Weather turns</label><input id="weather-turns" type="number" min="0" max="8"></div>
        <div class="field"><label for="terrain">Terrain</label><select id="terrain"><option value="">None</option><option>electric</option><option>grassy</option><option>misty</option><option>psychic</option></select></div>
        <div class="field"><label for="terrain-turns">Terrain turns</label><input id="terrain-turns" type="number" min="0" max="8"></div>
        <div class="field"><label for="trick-room">Trick Room</label><input id="trick-room" type="number" min="0" max="8"></div>
        <div class="field"><label for="gravity">Gravity</label><input id="gravity" type="number" min="0" max="8"></div>
        <div class="field"><label for="field-spacer">State</label><input id="field-spacer" value="Live" disabled></div>
        <button id="apply-field">Apply field</button>
      </div>
    </section>
    <section class="advice-section">
      <div class="section-heading">
        <h2>Ranked Advice</h2>
        <div class="rank-controls">
          <div class="field"><label for="top-results">Results</label><select id="top-results"><option>1</option><option selected>3</option><option>5</option></select></div>
          <div class="field"><label for="responses">Responses</label><select id="responses"><option>1</option><option selected>4</option><option>8</option><option>12</option></select></div>
          <button class="primary" id="analyze">Analyze turn</button>
        </div>
      </div>
      <div class="advice-list" id="advice-list"></div>
      <div class="status-line" id="status-line" aria-live="polite"></div>
    </section>
  </main>
  <script>
    var battleState = null;
    var statuses = ["healthy", "brn", "frz", "par", "psn", "slp", "tox"];
    var boostStats = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"];

    function element(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function field(labelText, control) {
      var wrapper = element("div", "field");
      var label = element("label", "", labelText);
      label.htmlFor = control.id;
      wrapper.append(label, control);
      return wrapper;
    }

    function input(type, value, id) {
      var control = document.createElement("input");
      control.type = type;
      control.value = value === undefined || value === null ? "" : String(value);
      control.id = id;
      return control;
    }

    function select(values, selected, id) {
      var control = document.createElement("select");
      control.id = id;
      values.forEach(function(value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = value === selected;
        control.appendChild(option);
      });
      return control;
    }

    function button(text, handler, className) {
      var control = element("button", className || "", text);
      control.type = "button";
      control.addEventListener("click", handler);
      return control;
    }

    async function api(path, options) {
      var response = await fetch(path, Object.assign({
        headers: { "content-type": "application/json" }
      }, options || {}));
      var body = await response.json();
      if (!response.ok) throw new Error(body.error || "Request failed.");
      return body;
    }

    async function applyEvent(event) {
      setStatus("Updating...");
      try {
        var body = await api("/api/event", { method: "POST", body: JSON.stringify(event) });
        battleState = body.state;
        render();
        setStatus("Updated.");
      } catch (error) {
        setStatus(error.message, true);
      }
    }

    function setStatus(message, isError) {
      var node = document.getElementById("status-line");
      node.textContent = message;
      node.className = "status-line" + (isError ? " error" : "");
    }

    function render() {
      document.getElementById("battle-meta").textContent =
        battleState.regulationId + " | advising " + battleState.playerSide;
      document.getElementById("turn").value = battleState.turnNumber;
      document.getElementById("weather").value = battleState.field.weather || "";
      document.getElementById("weather-turns").value = battleState.field.weatherTurnsRemaining;
      document.getElementById("terrain").value = battleState.field.terrain || "";
      document.getElementById("terrain-turns").value = battleState.field.terrainTurnsRemaining;
      document.getElementById("trick-room").value = battleState.field.trickRoomTurnsRemaining;
      document.getElementById("gravity").value = battleState.field.gravityTurnsRemaining;

      var grid = document.getElementById("battle-grid");
      grid.replaceChildren();
      [battleState.playerSide, battleState.playerSide === "p1" ? "p2" : "p1"].forEach(function(side) {
        grid.appendChild(renderSide(side));
      });
    }

    function renderSide(side) {
      var isOpponent = side !== battleState.playerSide;
      var section = element("section", "side-section" + (isOpponent ? " opponent" : ""));
      var heading = element("div", "section-heading");
      heading.append(
        element("h2", "", isOpponent ? "Opponent" : "Your side"),
        element("span", "side-label", side)
      );
      var list = element("div", "pokemon-list");
      battleState.teams[side].active.forEach(function(pokemon) {
        list.appendChild(renderPokemon(pokemon, side, isOpponent));
      });
      section.append(heading, list, renderSideConditions(side));
      return section;
    }

    function renderPokemon(pokemon, side, isOpponent) {
      var card = element("article", "pokemon-card");
      var title = element("div", "pokemon-title");
      title.append(
        element("h3", "", pokemon.set.displayName || pokemon.set.speciesId),
        element("span", "slot", pokemon.slot)
      );
      card.appendChild(title);

      var hpValue = pokemon.hp.unit === "exact" ? pokemon.hp.current : pokemon.hp.percent;
      var hpInput = input("number", hpValue, pokemon.slot + "-hp");
      hpInput.min = "0";
      hpInput.max = pokemon.hp.unit === "exact" ? String(pokemon.hp.max) : "100";
      var hpRow = element("div", "control-row");
      hpRow.append(
        field(pokemon.hp.unit === "exact" ? "HP / " + pokemon.hp.max : "HP percent", hpInput),
        button("Update", function() {
          var numeric = Number(hpInput.value);
          applyEvent({
            type: "damage-observed",
            slot: pokemon.slot,
            remainingHp: pokemon.hp.unit === "exact"
              ? { unit: "exact", current: numeric }
              : { unit: "percent", percent: numeric }
          });
        })
      );
      card.appendChild(hpRow);

      var statusSelect = select(statuses, pokemon.status, pokemon.slot + "-status");
      statusSelect.addEventListener("change", function() {
        applyEvent(statusSelect.value === "healthy"
          ? { type: "status-cleared", slot: pokemon.slot }
          : { type: "status-applied", slot: pokemon.slot, status: statusSelect.value });
      });
      var statusRow = element("div", "control-row");
      statusRow.append(field("Status", statusSelect), button("Faint", function() {
        applyEvent({ type: "faint-observed", slot: pokemon.slot });
      }, "danger"));
      card.appendChild(statusRow);

      if (isOpponent) card.appendChild(renderMoveKnowledge(pokemon));
      card.appendChild(renderAdvanced(pokemon, side));
      return card;
    }

    function renderMoveKnowledge(pokemon) {
      var wrapper = element("div");
      var moveInput = input("text", "", pokemon.slot + "-move");
      moveInput.placeholder = "Observed move";
      var submit = function() {
        if (!moveInput.value.trim()) return;
        applyEvent({ type: "move-observed", slot: pokemon.slot, moveId: canonicalId(moveInput.value) });
      };
      moveInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") submit();
      });
      var row = element("div", "control-row");
      row.append(field("Reveal move", moveInput), button("Add move", submit));
      wrapper.appendChild(row);

      var chips = element("div", "chips");
      var knowledge = pokemon.set.moveKnowledge;
      var observed = knowledge ? knowledge.observedMoveIds : [];
      var assumed = knowledge ? knowledge.assumedMoveIds : pokemon.set.moveIds;
      observed.forEach(function(moveId) { chips.appendChild(element("span", "chip observed", moveId)); });
      assumed.forEach(function(moveId) { chips.appendChild(element("span", "chip assumed", moveId)); });
      wrapper.appendChild(chips);
      return wrapper;
    }

    function renderAdvanced(pokemon, side) {
      var details = document.createElement("details");
      details.appendChild(element("summary", "", "More battle data"));
      var grid = element("div", "advanced-grid");
      var itemInput = input("text", pokemon.currentItemId === undefined ? pokemon.set.itemId || "" : pokemon.currentItemId || "", pokemon.slot + "-item");
      var abilityInput = input("text", pokemon.currentAbilityId || pokemon.set.abilityId, pokemon.slot + "-ability");
      grid.append(
        field("Current item", itemInput),
        field("Current ability", abilityInput),
        button("Apply item", function() {
          applyEvent({ type: "item-changed", slot: pokemon.slot, itemId: itemInput.value.trim() ? canonicalId(itemInput.value) : null });
        }),
        button("Apply ability", function() {
          applyEvent({ type: "ability-changed", slot: pokemon.slot, abilityId: canonicalId(abilityInput.value) });
        })
      );
      details.appendChild(grid);

      var statSelect = select(boostStats, "atk", pokemon.slot + "-boost-stat");
      var stageInput = input("number", "0", pokemon.slot + "-boost-stage");
      stageInput.min = "-6";
      stageInput.max = "6";
      var boostRow = element("div", "boost-row");
      boostRow.append(field("Boost stat", statSelect), field("Stage", stageInput), button("Apply", function() {
        var boosts = Object.assign({}, pokemon.boosts);
        boosts[statSelect.value] = Number(stageInput.value);
        applyEvent({ type: "boosts-changed", slot: pokemon.slot, boosts: boosts });
      }));
      details.appendChild(boostRow);

      var bench = battleState.teams[side].bench.filter(function(member) { return !member.fainted; });
      if (bench.length) {
        var benchSelect = document.createElement("select");
        benchSelect.id = pokemon.slot + "-bench";
        bench.forEach(function(member) {
          var option = document.createElement("option");
          option.value = member.benchSlot;
          option.textContent = (member.benchSlot + 1) + ". " + (member.set.displayName || member.set.speciesId);
          benchSelect.appendChild(option);
        });
        var switchRow = element("div", "control-row");
        switchRow.append(field("Switch in", benchSelect), button("Switch", function() {
          applyEvent({ type: "switch-observed", side: side, activeSlot: pokemon.slot, benchSlot: Number(benchSelect.value) });
        }));
        details.appendChild(switchRow);
      }
      return details;
    }

    function renderSideConditions(side) {
      var conditions = battleState.teams[side].sideConditions;
      var wrapper = element("div", "conditions");
      [
        ["Tailwind", "tailwindTurns"],
        ["Reflect", "reflectTurns"],
        ["Light Screen", "lightScreenTurns"]
      ].forEach(function(entry) {
        var control = input("number", conditions[entry[1]], side + "-" + entry[1]);
        control.min = "0";
        control.max = "8";
        control.addEventListener("change", function() {
          var changes = {};
          changes[entry[1]] = Number(control.value);
          applyEvent({ type: "side-condition-changed", side: side, changes: changes });
        });
        wrapper.appendChild(field(entry[0], control));
      });
      return wrapper;
    }

    function canonicalId(value) {
      return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    document.getElementById("set-turn").addEventListener("click", function() {
      applyEvent({ type: "turn-started", turnNumber: Number(document.getElementById("turn").value) });
    });

    document.getElementById("apply-field").addEventListener("click", function() {
      applyEvent({
        type: "field-changed",
        changes: {
          weather: document.getElementById("weather").value || null,
          weatherTurnsRemaining: Number(document.getElementById("weather-turns").value),
          terrain: document.getElementById("terrain").value || null,
          terrainTurnsRemaining: Number(document.getElementById("terrain-turns").value),
          trickRoomTurnsRemaining: Number(document.getElementById("trick-room").value),
          gravityTurnsRemaining: Number(document.getElementById("gravity").value)
        }
      });
    });

    document.getElementById("analyze").addEventListener("click", async function(event) {
      var control = event.currentTarget;
      control.disabled = true;
      setStatus("Analyzing candidate turns...");
      try {
        var body = await api("/api/rank", {
          method: "POST",
          body: JSON.stringify({
            top: Number(document.getElementById("top-results").value),
            maxOpponentPlans: Number(document.getElementById("responses").value)
          })
        });
        var list = document.getElementById("advice-list");
        list.replaceChildren();
        body.results.forEach(function(result) {
          var card = element("article", "advice-card");
          card.append(
            element("h3", "", result.rank + ". " + result.choice),
            element("div", "score", "Score " + round(result.score) + " | expected " + round(result.expectedScore) + " | worst " + round(result.worstCaseScore)),
            element("div", "outcome", result.explanationTags.join(", ") || "No explanation tags"),
            element("div", "outcome", result.outcomeSummary),
            element("div", "outcome", "Worst response: " + result.worstOpponentChoice)
          );
          list.appendChild(card);
        });
        setStatus(body.totalPlans + " plans ranked in " + Math.round(body.elapsedMs) + " ms.");
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        control.disabled = false;
      }
    });

    function round(value) { return Math.round(value * 100) / 100; }

    api("/api/state").then(function(body) {
      battleState = body.state;
      render();
      setStatus("Ready.");
    }).catch(function(error) {
      document.getElementById("connection").textContent = "Disconnected";
      setStatus(error.message, true);
    });
  </script>
</body>
</html>`;
