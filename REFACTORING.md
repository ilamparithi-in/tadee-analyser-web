# tadee.js Refactoring Log

All renames align `tadee.js` (and the consuming `analyzer.js`) to the
parameter names specified in the project brief.

---

## Input Parameters — `lineParams` object / constructor

| Old name | New name | Description |
|---|---|---|
| `diaStrands` | `strandDiaM` | Diameter of each strand (m) |
| `noOfStrands` | `scStrands` | Number of strands per sub-conductor |
| `spacingBwSubConds` | `scSpacingM` | Spacing between sub-conductors (m) |
| `noOfSCperBundle` | `scCount` | Number of sub-conductors per bundle (2/3/4) |
| `symmetry` (`'symmetrical'`/`'unsymmetrical'`) | `type` (`1` = sym, `0` = unsym) | System spacing type |
| `D` | `phaseSpacingM` | Phase conductor spacing for symmetrical layout (m) |
| `freq` | `frequency` | Power frequency (Hz) |
| `RperSCperKm` | `resSCPerKm` | Resistance per sub-conductor per km (Ω/km) |
| `Vnom_kV` | `nomSyskV` | Nominal system voltage (kV line-to-line) |
| `lineLength` | `lineLengthKm` | Length of the line (km) |
| `loadMW` | `recvLoadMW` | Receiving-end load (MW) |
| `pf` | `recvPF` | Receiving-end power factor |
| `model` (`'short'`/`'nominal pi'`/`'distributed'`) | `model` (`0`/`1`/`2`) | Line model (type unchanged, values changed to numeric) |

`Dab`, `Dbc`, `Dca` — **unchanged**.

---

## Internal field renames (constructor assignments)

Every `lineParams.X` read and `this.X` assignment mirrors the table above.
The phase-voltage conversion is preserved:

```js
// before
this.Vnom_kV = lineParams.Vnom_kV / Math.sqrt(3);

// after
this.nomSyskV = lineParams.nomSyskV / Math.sqrt(3);
```

---

## Output / Return Value Renames

### `LandCperPhasePerKm()`

| Old key | New key |
|---|---|
| `inductance` | `Lphkm` |
| `capacitance` | `Cphkm` |

### `XLandXC()`

| Old key | New key |
|---|---|
| `Reactance_L` | `Xl` |
| `Reactance_C` | `Xc` |

### `power_loss_MW_and_efficiency()`

| Old key | New key |
|---|---|
| `power_loss_MW` | `lossMW` |
| `efficiency` | `eta` |

---

## Model comparison values

All string comparisons in `ABCDparams()` changed to numeric:

| Old | New |
|---|---|
| `model === 'short'` | `model === 0` |
| `model === 'nominal pi'` | `model === 1` |
| `model === 'distributed'` | `model === 2` |

---

## Symmetry comparison values (`LandCperPhasePerKm`)

| Old | New |
|---|---|
| `symmetry === 'symmetrical'` | `type === 1` |
| `symmetry === 'unsymmetrical'` | `else` (any non-1 `type`) |
| local `let symmetry = this.symmetry` | local `let type = this.type` |

---

## Cascade changes in `analyzer.js`

| Change | Detail |
|---|---|
| `params` object keys | All renamed to match new input param names (table above) |
| `symmetry` field | Replaced with `type: ... ? 1 : 0` expression |
| `D` field | Renamed to `phaseSpacingM` |
| `lineLength` field | Renamed to `lineLengthKm` |
| `_normaliseModel()` return values | Now returns `0`/`1`/`2` instead of `'short'`/`'nominal pi'`/`'distributed'` |
| `lc.inductance` | → `lc.Lphkm` |
| `lc.capacitance` | → `lc.Cphkm` |
| `xl.Reactance_L` | → `xl.Xl` |
| `xl.Reactance_C` | → `xl.Xc` |
| `pl.power_loss_MW` | → `pl.loss` |
| `pl.efficiency` | → `pl.eta` |
