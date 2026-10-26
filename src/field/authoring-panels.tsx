import { useEffect, useState } from "react";
import { NumberField, NameField } from "./controls";
import type { FieldNode } from "../core/field";
import type { Artboard } from "../core/authoring";
type Material = Extract<FieldNode, { kind: "text" | "shape" }>;
function TextEditor({
  value,
  locked,
  commit,
}: {
  value: string;
  locked: boolean;
  commit: (s: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="text-editor">
      Text
      <textarea
        disabled={locked}
        value={draft}
        maxLength={4096}
        rows={5}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            e.stopPropagation();
          }
        }}
      />
    </label>
  );
}
export function MaterialInspector({
  node,
  locked,
  edit,
}: {
  node: Material;
  locked: boolean;
  edit: (change: (n: Material) => void) => void;
}) {
  const number = (
    label: string,
    value: number,
    change: (n: Material, v: number) => void,
    min: number,
    max: number,
    step = 1,
  ) => (
    <NumberField
      label={label}
      value={value}
      disabled={locked}
      min={min}
      max={max}
      step={step}
      onCommit={(v) => edit((n) => change(n, v))}
    />
  );
  return (
    <section className="inspector-section">
      <h3>{node.kind === "text" ? "Text material" : "Shape material"}</h3>
      {node.kind === "text" && (
        <>
          <TextEditor
            value={node.content}
            locked={locked}
            commit={(v) =>
              edit((n) => {
                if (n.kind === "text") n.content = v;
              })
            }
          />
          <p className="control-help">
            Archivo. Text wraps inside its editable box; anything below the box
            is clipped.
          </p>
          <div className="number-grid">
            {number(
              "Type size",
              node.fontSize,
              (n, v) => {
                if (n.kind === "text") n.fontSize = v;
              },
              4,
              512,
            )}
            {number(
              "Line height",
              node.lineHeight,
              (n, v) => {
                if (n.kind === "text") n.lineHeight = v;
              },
              0.5,
              3,
              0.05,
            )}
            {number(
              "Tracking",
              node.tracking,
              (n, v) => {
                if (n.kind === "text") n.tracking = v;
              },
              -20,
              100,
              0.5,
            )}
          </div>
          <label>
            Weight
            <select
              disabled={locked}
              value={node.weight}
              onChange={(e) =>
                edit((n) => {
                  if (n.kind === "text") n.weight = Number(e.target.value);
                })
              }
            >
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Alignment
            <select
              disabled={locked}
              value={node.align}
              onChange={(e) =>
                edit((n) => {
                  if (n.kind === "text")
                    n.align = e.target.value as "left" | "center" | "right";
                })
              }
            >
              {["left", "center", "right"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="color-control">
            Ink
            <input
              type="color"
              disabled={locked}
              value={node.color}
              onChange={(e) =>
                edit((n) => {
                  if (n.kind === "text") n.color = e.target.value;
                })
              }
            />
          </label>
        </>
      )}
      <div className="number-grid">
        {number("Box width", node.width, (n, v) => (n.width = v), 1, 4096)}
        {number("Box height", node.height, (n, v) => (n.height = v), 1, 4096)}
      </div>
      {node.kind === "shape" && (
        <>
          <label>
            Shape
            <select
              disabled={locked}
              value={node.shape}
              onChange={(e) =>
                edit((n) => {
                  if (n.kind === "shape")
                    n.shape = e.target.value as "rectangle" | "ellipse";
                })
              }
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </label>
          {(["fill", "stroke"] as const).map((k) => (
            <div className="color-control" key={k}>
              <label>
                <input
                  disabled={locked}
                  type="checkbox"
                  checked={node[k] !== null}
                  onChange={(e) =>
                    edit((n) => {
                      if (n.kind === "shape")
                        n[k] = e.target.checked ? "#242823" : null;
                    })
                  }
                />{" "}
                {k === "fill" ? "Fill" : "Outline"}
              </label>
              <input
                aria-label={`${k} colour`}
                disabled={locked || node[k] === null}
                type="color"
                value={node[k] ?? "#242823"}
                onChange={(e) =>
                  edit((n) => {
                    if (n.kind === "shape") n[k] = e.target.value;
                  })
                }
              />
            </div>
          ))}
          {number(
            "Outline width",
            node.strokeWidth,
            (n, v) => {
              if (n.kind === "shape") n.strokeWidth = v;
            },
            0,
            256,
          )}
        </>
      )}
      <p className="control-help">
        Linked copies share this material. Use Vary to edit a separate version.
      </p>
    </section>
  );
}
export function ArtboardInspector({
  board,
  locked,
  edit,
  onDelete,
  onExport,
}: {
  board: Artboard;
  locked: boolean;
  edit: (change: (b: Artboard) => void) => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const presets = [
    ["Portrait", 1080, 1350],
    ["Square", 1080, 1080],
    ["Landscape", 1920, 1080],
    ["A4 at 300 dpi", 2480, 3508],
  ] as const;
  const number = (
    label: string,
    key: "x" | "y" | "width" | "height" | "margin" | "columns" | "gutter",
    min: number,
    max: number,
  ) => (
    <NumberField
      label={label}
      value={board[key]}
      disabled={locked}
      min={min}
      max={max}
      onCommit={(v) =>
        edit((b) => {
          b[key] = v;
        })
      }
    />
  );
  return (
    <section className="inspector-section">
      <NameField
        label="Artboard name"
        value={board.name}
        disabled={locked}
        onCommit={(v) =>
          edit((b) => {
            b.name = v;
          })
        }
      />
      <label>
        Size preset
        <select
          disabled={locked}
          value=""
          onChange={(e) => {
            const p = presets[Number(e.target.value)];
            if (p)
              edit((b) => {
                b.width = p[1];
                b.height = p[2];
                b.margin = Math.min(b.margin, Math.min(b.width, b.height) / 4);
                b.gutter = Math.min(b.gutter, b.width / (b.columns * 2));
              });
          }}
        >
          <option value="">Custom size</option>
          {presets.map((p, i) => (
            <option key={p[0]} value={i}>
              {p[0]}
            </option>
          ))}
        </select>
      </label>
      <div className="number-grid">
        {number("Width", "width", 1, 8192)}
        {number("Height", "height", 1, 8192)}
        {number("Position X", "x", -1e6, 1e6)}
        {number("Position Y", "y", -1e6, 1e6)}
      </div>
      <div className="color-control">
        <label>
          <input
            type="checkbox"
            disabled={locked}
            checked={board.background !== null}
            onChange={(e) =>
              edit((b) => {
                b.background = e.target.checked ? "#f4f4ef" : null;
              })
            }
          />{" "}
          Paper background
        </label>
        <input
          type="color"
          aria-label="Artboard background"
          disabled={locked || board.background === null}
          value={board.background ?? "#f4f4ef"}
          onChange={(e) =>
            edit((b) => {
              b.background = e.target.value;
            })
          }
        />
      </div>
      <h3>Layout guides</h3>
      <div className="number-grid">
        {number("Margin", "margin", 0, Math.min(board.width, board.height) / 2)}
        {number("Columns", "columns", 1, 24)}
        {number("Gutter", "gutter", 0, 8192)}
      </div>
      <p className="control-help">
        Guides stay out of the export. Artwork uses the same positions in FIELD
        and FRAME. Export crops included artwork to this artboard. Moving the
        artboard moves its boundary; artwork stays in place.
      </p>
      <button disabled={locked} className="primary" onClick={onExport}>
        Export artboard PNG
      </button>
      <p className="control-help">
        Exact pixel size, sRGB. A4 describes pixel dimensions; this PNG does not
        embed print resolution or CMYK.
      </p>
      <button disabled={locked} className="danger" onClick={onDelete}>
        Remove artboard
      </button>
    </section>
  );
}
