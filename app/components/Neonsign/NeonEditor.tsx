"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import NeonBoard, { type NeonBoardHandle } from "./NeonBoard";
import { colorListTagAt, parseTagAttrsPublic } from "./engine";
import {
  ACCENT_HEX,
  ART_SAMPLE,
  DEFAULTS,
  EFFECT_LABELS,
  SWATCHES,
  cloneConfig,
  mergeConfig,
  minimalConfig,
  normalizeMessage,
  resolveConfig,
  sanitizeConfig,
  type ColorMode,
  type DotShape,
  type EffectName,
  type NeonConfig,
  type NeonMessage,
} from "./types";
import { deletePreset, loadPresetByName, loadPresets, savePreset, type Preset } from "./presets";
import {
  LARGE_FILE_BYTES,
  downloadBlob,
  estimateExport,
  exportFilename,
  exportGif,
  exportVideo,
  shareFile,
  videoSupport,
  type ExportKind,
} from "./exporter";
import { configFromLocation, encodeConfig, previewSegments, SITE_TITLE } from "./share";
import { kakaoShareEnabled, loadKakao, shareToKakao } from "./kakao";
import styles from "./Neonsign.module.css";

const CUSTOM_COLOR_DEFAULT = "#8a2be2";
const noopSubscribe = () => () => {};

function RangeField({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className={styles.val}>{format(value)}</span>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.field}>
      {label ? <label>{label}</label> : null}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.field}>
      <input type="checkbox" id={`chk-${label}`} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={`chk-${label}`}>{label}</label>
    </div>
  );
}

export default function NeonEditor() {
  const [cfg, setCfg] = useState<NeonConfig>(() => mergeConfig(cloneConfig(DEFAULTS), {}));
  const boardRef = useRef<NeonBoardHandle>(null);
  const [playing, setPlaying] = useState(true);

  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState<number | null>(0);
  const pendingSelection = useRef<{ index: number; start: number; end: number } | null>(null);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [status, setStatus] = useState("");

  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // 서버 렌더에서는 알 수 없으니 false로 두고, 브라우저에서 실제 지원 여부를 읽는다
  const canRecordVideo = useSyncExternalStore(
    noopSubscribe,
    () => !!videoSupport(),
    () => false
  );

  useEffect(() => {
    const p = pendingSelection.current;
    if (!p) return;
    pendingSelection.current = null;
    const el = inputRefs.current.get(p.index);
    if (el) {
      el.focus();
      el.setSelectionRange(p.start, p.end);
    }
  });

  useEffect(() => {
    loadPresets().then(setPresets);
    if (kakaoShareEnabled) loadKakao().catch(() => {});
    // 공유받은 링크(#c=...)로 들어오면 그 설정으로 시작한다
    const shared = configFromLocation(window.location.search, window.location.hash);
    if (shared !== undefined) {
      resolveConfig(shared, loadPresetByName)
        .then((c) => {
          setCfg(sanitizeConfig(c));
          setStatus("링크로 받은 설정을 불러왔습니다");
        })
        .catch(() => setStatus("링크의 설정을 읽을 수 없습니다"));
    }
  }, []);

  function updateMessage(index: number, patch: Partial<NeonMessage>) {
    setCfg((prev) => {
      const messages = prev.messages.slice();
      messages[index] = { ...messages[index], ...patch };
      return { ...prev, messages };
    });
  }

  // --- 글자별 색 마크업 (선택 글자를 감싸거나, 흐름·반짝 태그의 색 목록에 추가) ---
  function wrapSelection(tag: string) {
    if (focusedIndex == null) return;
    const inp = inputRefs.current.get(focusedIndex);
    if (!inp) return;
    const s = inp.selectionStart,
      e = inp.selectionEnd;
    if (s == null || e == null || s === e) {
      setStatus("문구 칸에서 글자를 먼저 드래그해 선택하세요");
      return;
    }
    const v = inp.value;
    const next = v.slice(0, s) + "{" + tag + ":" + v.slice(s, e) + "}" + v.slice(e);
    updateMessage(focusedIndex, { text: next });
    pendingSelection.current = { index: focusedIndex, start: s, end: e + tag.length + 3 };
  }

  function applyColor(color: string) {
    if (focusedIndex == null) return;
    const inp = inputRefs.current.get(focusedIndex);
    if (!inp) return;
    const s = inp.selectionStart ?? 0,
      e = inp.selectionEnd ?? s;
    const v = inp.value;
    const tag = colorListTagAt(v, s);
    if (!tag) {
      wrapSelection(color);
      return;
    }
    const body = v.slice(tag.bodyStart, tag.bodyEnd);
    const next = body.slice(0, tag.tokenStart) + tag.name + "(" + tag.colors.concat(color).join(",") + ")" + body.slice(tag.tokenEnd);
    const delta = next.length - body.length;
    const newValue = v.slice(0, tag.bodyStart) + next + v.slice(tag.bodyEnd);
    updateMessage(focusedIndex, { text: newValue });
    const shift = (p: number) => (p >= tag.bodyEnd ? p + delta : p);
    pendingSelection.current = { index: focusedIndex, start: shift(s), end: shift(e) };
    setStatus(tag.name + "에 " + color + " 추가 (" + (tag.colors.length + 1) + "색)");
  }

  function clearMarkup() {
    if (focusedIndex == null) return;
    const inp = inputRefs.current.get(focusedIndex);
    if (!inp) return;
    let s = inp.selectionStart,
      e = inp.selectionEnd;
    const v = inp.value;
    if (s == null || e == null || s === e) {
      s = 0;
      e = v.length;
    }
    const seg = v
      .slice(s, e)
      .replace(/\{([^{}:]{1,120}):/g, (m0, body) => (parseTagAttrsPublic(body) ? "" : m0))
      .replace(/\}/g, "");
    updateMessage(focusedIndex, { text: v.slice(0, s) + seg + v.slice(e) });
  }

  // --- 문구 목록 조작 ---
  function addMessage() {
    setCfg((prev) => ({ ...prev, messages: [...prev.messages, normalizeMessage({ text: "새 문구", effect: "pushUp" as EffectName, hold: 2 })] }));
  }
  function removeMessage(i: number) {
    setCfg((prev) => {
      if (prev.messages.length === 1) return prev;
      const messages = prev.messages.slice();
      messages.splice(i, 1);
      return { ...prev, messages };
    });
    setFocusedIndex(null);
  }
  function moveMessage(i: number, dir: -1 | 1) {
    setCfg((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.messages.length) return prev;
      const messages = prev.messages.slice();
      const [item] = messages.splice(i, 1);
      messages.splice(j, 0, item);
      return { ...prev, messages };
    });
  }
  function toggleArt(i: number) {
    setCfg((prev) => {
      const messages = prev.messages.slice();
      const m = { ...messages[i] };
      if (Array.isArray(m.art)) delete m.art;
      else m.art = ART_SAMPLE.slice();
      messages[i] = m;
      return { ...prev, messages };
    });
  }
  function toggleFlag(i: number, key: "chain" | "invert") {
    setCfg((prev) => {
      const messages = prev.messages.slice();
      const m = { ...messages[i] };
      if (m[key]) delete m[key];
      else m[key] = true;
      messages[i] = m;
      return { ...prev, messages };
    });
  }

  // --- 프리셋 ---
  async function reloadPresets(keep?: string) {
    const list = await loadPresets();
    setPresets(list);
    if (keep) setSelectedPreset(keep);
  }
  async function handleLoadPreset() {
    const found = presets.find((p) => p.name === selectedPreset);
    if (!found) {
      setStatus("불러올 프리셋이 없습니다");
      return;
    }
    setCfg(mergeConfig(cloneConfig(DEFAULTS), found.cfg));
    setPresetName(found.name);
    setStatus(`'${found.name}' 불러옴`);
  }
  async function handleSavePreset() {
    const name = presetName.trim();
    if (!name) {
      setStatus("프리셋 이름을 입력하세요");
      return;
    }
    await savePreset(name, minimalConfig(cfg));
    await reloadPresets(name);
    setStatus(`'${name}' 저장됨 (이 브라우저에 저장)`);
  }
  async function handleDeletePreset() {
    if (!selectedPreset) return;
    await deletePreset(selectedPreset);
    await reloadPresets();
    setStatus(`'${selectedPreset}' 삭제됨`);
    setSelectedPreset("");
  }

  // --- 임베드 / 코드 불러오기 ---
  const embedCode = JSON.stringify(minimalConfig(cfg), null, 2);
  async function copyEmbed() {
    await navigator.clipboard.writeText(embedCode);
    setStatus("설정 코드를 복사했습니다");
  }

  function parseImport(raw: string): unknown {
    let s = raw.trim().replace(/^```[\w-]*\s*/, "").replace(/```\s*$/, "").trim();
    const m = s.match(/dv\.view\(\s*(["'`])[^"'`]*\1\s*,\s*([\s\S]*)\)\s*;?\s*$/);
    if (m) s = m[2].trim();
    return JSON.parse(s);
  }
  async function handleImport() {
    let input: unknown;
    try {
      input = parseImport(importText);
    } catch {
      setImportStatus("읽을 수 없는 코드입니다 (JSON 형식이어야 해요. 키에도 따옴표가 필요합니다)");
      return;
    }
    if (input && typeof input === "object" && !Array.isArray(input) && (input as { editor?: boolean }).editor) {
      setImportStatus("편집기 블록이라 불러올 설정이 없습니다");
      return;
    }
    let fixed: NeonConfig;
    try {
      fixed = sanitizeConfig(await resolveConfig(input, loadPresetByName));
    } catch {
      setImportStatus("설정 형식이 맞지 않습니다");
      return;
    }
    setCfg(fixed);
    setImportStatus(`불러옴 · 문구 ${fixed.messages.length}개`);
  }

  // --- 내보내기 · 공유 ---
  async function makeFile(kind: ExportKind): Promise<{ blob: Blob; filename: string } | null> {
    const board = boardRef.current;
    if (!board || exporting) return null;

    // 길이 제한은 없고, 크게 나올 것 같으면 만들기 전에 물어본다
    const est = estimateExport(board, kind);
    if (est.bytes > LARGE_FILE_BYTES) {
      const wait = kind === "video" ? `\n영상은 실제 시간으로 녹화해서 약 ${Math.ceil(est.seconds)}초 걸립니다.` : "";
      const ok = window.confirm(
        `${Math.ceil(est.seconds)}초 분량이라 파일이 약 ${(est.bytes / 1024 / 1024).toFixed(0)}MB로 클 것 같아요.${wait}\n` +
          "카카오톡·인스타그램에 올릴 때 실패하거나 오래 걸릴 수 있습니다. 계속할까요?"
      );
      if (!ok) {
        setExportStatus("내보내기를 취소했습니다");
        return null;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    try {
      if (kind === "gif") {
        const blob = await exportGif(board, (p) => setExportStatus(`GIF 만드는 중… ${Math.round(p * 100)}%`), controller.signal);
        return { blob, filename: exportFilename("gif") };
      }
      const { blob, ext } = await exportVideo(
        board,
        (p) => setExportStatus(`영상 녹화 중… ${Math.round(p * 100)}% (한 바퀴 도는 시간만큼 걸려요)`),
        controller.signal
      );
      return { blob, filename: exportFilename(ext) };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setExportStatus("내보내기를 취소했습니다");
      else setExportStatus("만들기 실패: " + (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      abortRef.current = null;
      setExporting(false);
      setPlaying(boardRef.current?.isPlaying() ?? true);
    }
  }

  const sizeText = (b: Blob) => (b.size > 1024 * 1024 ? (b.size / 1024 / 1024).toFixed(1) + "MB" : Math.round(b.size / 1024) + "KB");
  const largeWarning = (b: Blob) => (b.size > LARGE_FILE_BYTES ? " ⚠ 용량이 커서 메신저·SNS에 올릴 때 실패하거나 오래 걸릴 수 있어요" : "");

  async function handleSave(kind: "gif" | "video") {
    const file = await makeFile(kind);
    if (!file) return;
    downloadBlob(file.blob, file.filename);
    setExportStatus(`${file.filename} 저장 (${sizeText(file.blob)})${largeWarning(file.blob)}`);
  }

  async function handleShare(kind: "gif" | "video") {
    const file = await makeFile(kind);
    if (!file) return;
    const firstText = cfg.messages.find((m) => m.text)?.text?.replace(/\{[^{}:]*:|\}/g, "") || "전광판";
    const result = await shareFile(file.blob, file.filename, firstText);
    if (result === "shared") setExportStatus("공유했습니다" + largeWarning(file.blob));
    else if (result === "cancelled") setExportStatus("공유를 취소했습니다");
    else setExportStatus(`이 브라우저는 파일 공유를 지원하지 않아 ${file.filename} 로 저장했습니다 (${sizeText(file.blob)})${largeWarning(file.blob)}`);
  }

  function shareUrl(path: string) {
    return `${window.location.origin}${path}?c=${encodeConfig(minimalConfig(cfg))}`;
  }

  async function copyText(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setExportStatus(done);
    } catch {
      setExportStatus("클립보드에 복사하지 못했습니다");
    }
  }

  async function handleKakao() {
    const code = encodeConfig(minimalConfig(cfg));
    const url = `${window.location.origin}/service/neonsign?c=${code}`;
    try {
      await shareToKakao({
        url,
        title: SITE_TITLE,
        description: previewSegments(cfg).text || "움직이는 전광판 보기",
        imageUrl: `${window.location.origin}/service/neonsign/og?c=${code}`,
      });
      setExportStatus("카카오톡 공유 창을 열었습니다");
    } catch (e) {
      setExportStatus("카카오톡 공유 실패: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function copyLink() {
    copyText(shareUrl(window.location.pathname), "편집기 링크를 복사했습니다 — 받는 사람이 열면 같은 전광판이 나옵니다");
  }

  function copyEmbedTag() {
    const height = (boardRef.current?.getCssSize().height ?? 120) + 40;
    const tag = `<iframe src="${shareUrl("/service/neonsign/embed")}" width="100%" height="${height}" style="border:0" loading="lazy" title="기끽이넷 전광판"></iframe>`;
    copyText(tag, "임베드 코드를 복사했습니다 — 다른 사이트의 HTML에 붙여넣으세요");
  }

  const colorMarkupHint = "숫자 칸은 표시 시간(초) / 속도(초당 칼럼, 비우면 전체 속도). 마크업은 {#ff0000 깜빡:SALE}처럼 속성을 나열하거나 태그 안에 태그를 넣을 수 있습니다. 반전을 켠 문구는 글자 자리만 끄고 나머지를 문구 색으로 켭니다. 이어짐을 켜면 그 문구가 반복됩니다.";

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <NeonBoard ref={boardRef} config={cfg} />

        <div className={styles.bar}>
          <button
            className={styles.btn}
            onClick={() => {
              const next = !playing;
              boardRef.current?.setPlaying(next);
              setPlaying(next);
            }}
          >
            {playing ? "⏸ 정지" : "▶ 재생"}
          </button>
          <button className={`${styles.btn} ${styles.btnSub}`} disabled={exporting} onClick={() => boardRef.current?.restart()}>
            ↺ 처음부터
          </button>
        </div>

        {/* 내보내기 · 공유 */}
        <div className={styles.sec}>
          <h4>내보내기 · 공유</h4>
          <div className={styles.bar}>
            <button className={styles.btn} disabled={exporting} onClick={() => handleSave("gif")}>
              GIF 저장
            </button>
            <button
              className={styles.btn}
              disabled={exporting || !canRecordVideo}
              title={canRecordVideo ? "" : "이 브라우저는 영상 녹화를 지원하지 않습니다"}
              onClick={() => handleSave("video")}
            >
              영상 저장
            </button>
            <button className={`${styles.btn} ${styles.btnSub}`} disabled={exporting} onClick={() => handleShare("gif")}>
              GIF로 공유
            </button>
            <button className={`${styles.btn} ${styles.btnSub}`} disabled={exporting || !canRecordVideo} onClick={() => handleShare("video")}>
              영상으로 공유
            </button>
            {kakaoShareEnabled && (
              <button className={`${styles.btn} ${styles.btnKakao}`} disabled={exporting} onClick={handleKakao}>
                카카오톡 공유
              </button>
            )}
            <button className={`${styles.btn} ${styles.btnSub}`} disabled={exporting} onClick={copyLink}>
              🔗 링크 복사
            </button>
            <button className={`${styles.btn} ${styles.btnSub}`} disabled={exporting} onClick={copyEmbedTag}>
              &lt;/&gt; 임베드 코드
            </button>
            {exporting && (
              <button className={`${styles.btn} ${styles.btnSub}`} onClick={() => abortRef.current?.abort()}>
                ✕ 취소
              </button>
            )}
          </div>
          <div className={styles.status}>{exportStatus}</div>
          <p className={styles.hint}>
            모든 문구가 한 바퀴 도는 만큼 담기고, 파일이 크게 나올 것 같으면 만들기 전에 알려 드립니다. 공유는 휴대폰에서 누르면 카카오톡·인스타그램 같은 앱으로 바로 보낼 수 있고,
            파일 공유가 안 되는 브라우저에서는 내려받기로 대신합니다. 인스타그램에는 영상이 잘 맞습니다. 링크와 임베드 코드는 설정을 주소에 담아서 따로 저장하지 않아도 됩니다.
          </p>
        </div>

        {/* 문구 목록 */}
        <div className={styles.sec}>
          <h4>문구 — 위에서부터 순서대로 돌아감</h4>
          {cfg.messages.map((m, i) => (
            <div className={styles.msgRow} key={i}>
              <input
                type="color"
                value={m.color || ACCENT_HEX}
                title="이 문구의 기본 색"
                onChange={(e) => updateMessage(i, { color: e.target.value })}
              />

              {Array.isArray(m.art) ? (
                <textarea
                  className={styles.art}
                  value={m.art.join("\n")}
                  spellCheck={false}
                  rows={Math.min(12, Math.max(3, m.art.length))}
                  title="한 줄이 도트 한 행. . 이나 공백은 꺼짐, # 은 문구 색. 다른 글자 색은 palette로 지정"
                  onChange={(e) =>
                    updateMessage(i, { art: e.target.value.split("\n").map((l) => l.replace(/\s+$/, "")).slice(0, 64) })
                  }
                />
              ) : (
                <input
                  type="text"
                  value={m.text || ""}
                  placeholder="표시할 문구"
                  ref={(el) => {
                    if (el) inputRefs.current.set(i, el);
                    else inputRefs.current.delete(i);
                  }}
                  onFocus={() => setFocusedIndex(i)}
                  onChange={(e) => updateMessage(i, { text: e.target.value.slice(0, 500) })}
                />
              )}

              <select
                value={m.effect || "none"}
                title="등장 효과"
                onChange={(e) => updateMessage(i, { effect: e.target.value as EffectName })}
              >
                {EFFECT_LABELS.map(([v, text]) => (
                  <option key={v} value={v}>
                    {text}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={0.2}
                max={60}
                step={0.1}
                value={m.hold ?? 2}
                title="표시 시간(초) — 흐르기 효과에서는 무시됨(이어짐을 켜면 이어서 흐르는 시간)"
                onChange={(e) => updateMessage(i, { hold: Number(e.target.value) || 2 })}
              />

              <input
                type="number"
                min={1}
                max={120}
                step={1}
                placeholder="속도"
                value={m.speed == null ? "" : m.speed}
                title="이 문구만 쓸 속도(초당 칼럼 수). 비우면 아래 움직임의 속도를 따름"
                onChange={(e) => {
                  const raw = e.target.value;
                  const v = Number(raw);
                  if (!raw.trim() || !Number.isFinite(v) || v <= 0) {
                    setCfg((prev) => {
                      const messages = prev.messages.slice();
                      const mm = { ...messages[i] };
                      delete mm.speed;
                      messages[i] = mm;
                      return { ...prev, messages };
                    });
                  } else {
                    updateMessage(i, { speed: Math.min(120, Math.max(1, v)) });
                  }
                }}
              />

              <button
                className={`${styles.btn} ${styles.btnSub} ${styles.toggle} ${Array.isArray(m.art) ? styles.isOn : ""}`}
                title="문구 대신 도트 그림을 찍는다 (끄면 원래 문구로 돌아간다)"
                onClick={() => toggleArt(i)}
              >
                그림
              </button>
              <button
                className={`${styles.btn} ${styles.btnSub} ${styles.toggle} ${m.chain ? styles.isOn : ""}`}
                title="이 문구를 원래 글자 간격으로 반복한다"
                onClick={() => toggleFlag(i, "chain")}
              >
                이어짐
              </button>
              <button
                className={`${styles.btn} ${styles.btnSub} ${styles.toggle} ${m.invert ? styles.isOn : ""}`}
                title="배경 반전: 글자 자리만 끄고 나머지 도트를 문구 색으로 켠다"
                onClick={() => toggleFlag(i, "invert")}
              >
                반전
              </button>

              <button className={styles.btnIcon} title="위로" onClick={() => moveMessage(i, -1)}>
                ↑
              </button>
              <button className={styles.btnIcon} title="아래로" onClick={() => moveMessage(i, 1)}>
                ↓
              </button>
              <button className={styles.btnIcon} title="삭제" onClick={() => removeMessage(i)}>
                ✕
              </button>
            </div>
          ))}
          <button className={`${styles.btn} ${styles.btnSub}`} onClick={addMessage}>
            + 문구 추가
          </button>

          {/* 글자별 색 */}
          <div className={styles.bar}>
            <span className={styles.val}>선택 글자:</span>
            {SWATCHES.map((c) => (
              <button
                key={c}
                className={styles.swatch}
                style={{ background: c }}
                title={`${c} 로 칠하기 (흐름·반짝 태그 안이면 그 색 목록에 추가)`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c)}
              />
            ))}
            <input
              type="color"
              defaultValue={CUSTOM_COLOR_DEFAULT}
              title="직접 고른 색으로 칠하기"
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => applyColor(e.target.value)}
            />
            {(["무지개", "흐름", "반짝", "깜빡"] as const).map((tag) => (
              <button
                key={tag}
                className={`${styles.btn} ${styles.btnSub}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapSelection(tag)}
              >
                {tag}
              </button>
            ))}
            <button className={`${styles.btn} ${styles.btnSub}`} onMouseDown={(e) => e.preventDefault()} onClick={clearMarkup}>
              마크업 지우기
            </button>
          </div>
          <p className={styles.hint}>{colorMarkupHint}</p>
        </div>

        {/* 패널 */}
        <div className={styles.sec}>
          <h4>패널</h4>
          <div className={styles.controls}>
            <RangeField label="행 수" min={5} max={24} value={cfg.rows} format={String} onChange={(v) => setCfg((p) => ({ ...p, rows: v }))} />
            <RangeField
              label="글자 굵기"
              min={1}
              max={5}
              value={cfg.weight}
              format={(v) => ["", "가늘게", "보통", "약간 굵게", "굵게", "아주 굵게"][v]}
              onChange={(v) => setCfg((p) => ({ ...p, weight: v }))}
            />
            <RangeField label="도트 크기" min={4} max={18} value={cfg.cell} format={(v) => v + "px"} onChange={(v) => setCfg((p) => ({ ...p, cell: v }))} />
            <RangeField
              label="가로 칼럼"
              min={0}
              max={200}
              value={cfg.width}
              format={(v) => (v ? String(v) : "자동")}
              onChange={(v) => setCfg((p) => ({ ...p, width: v }))}
            />
            <RangeField
              label="밝기"
              min={20}
              max={100}
              value={Math.round(cfg.brightness * 100)}
              format={(v) => v + "%"}
              onChange={(v) => setCfg((p) => ({ ...p, brightness: v / 100 }))}
            />
            <SelectField<DotShape>
              label="도트 모양"
              options={[
                ["circle", "원형"],
                ["square", "사각"],
              ]}
              value={cfg.shape}
              onChange={(v) => setCfg((p) => ({ ...p, shape: v }))}
            />
            <CheckField label="잔광" checked={cfg.glow} onChange={(v) => setCfg((p) => ({ ...p, glow: v }))} />
            <CheckField label="모듈선" checked={cfg.bezel} onChange={(v) => setCfg((p) => ({ ...p, bezel: v }))} />
          </div>
        </div>

        {/* 색 표현 */}
        <div className={styles.sec}>
          <h4>색 표현</h4>
          <div className={styles.controls}>
            <SelectField<ColorMode>
              label="모드"
              options={[
                ["mono", "단색"],
                ["duo", "듀오톤"],
                ["rgb", "풀컬러"],
              ]}
              value={cfg.colorMode}
              onChange={(v) => setCfg((p) => ({ ...p, colorMode: v }))}
            />
            {cfg.colorMode !== "mono" && (
              <CheckField label="서브픽셀 보이기" checked={cfg.subpixel} onChange={(v) => setCfg((p) => ({ ...p, subpixel: v }))} />
            )}
            {cfg.colorMode === "duo" && (
              <div className={styles.field}>
                <label>LED 두 색</label>
                {[0, 1].map((i) => (
                  <input
                    key={i}
                    type="color"
                    value={cfg.duo[i]}
                    onChange={(e) =>
                      setCfg((p) => {
                        const duo = [...p.duo] as [string, string];
                        duo[i] = e.target.value;
                        return { ...p, duo };
                      })
                    }
                  />
                ))}
              </div>
            )}
            {cfg.colorMode === "rgb" && (
              <RangeField
                label="계조"
                min={2}
                max={8}
                value={cfg.levels}
                format={(v) => v + "단계"}
                onChange={(v) => setCfg((p) => ({ ...p, levels: v }))}
              />
            )}
          </div>
          <p className={styles.hint}>
            듀오톤은 픽셀마다 LED가 두 개뿐인 실제 2색 패널을 흉내냅니다. 풀컬러의 계조를 2단계로 내리면 옛날 8색 간판이 됩니다.
          </p>
        </div>

        {/* 움직임 */}
        <div className={styles.sec}>
          <h4>움직임</h4>
          <div className={styles.controls}>
            <RangeField label="속도" min={1} max={60} value={cfg.speed} format={String} onChange={(v) => setCfg((p) => ({ ...p, speed: v }))} />
            <RangeField
              label="이어짐 추가 간격"
              min={0}
              max={40}
              value={cfg.gap}
              format={(v) => (v ? "+" + v + "칸" : "글자 간격")}
              onChange={(v) => setCfg((p) => ({ ...p, gap: v }))}
            />
            <RangeField
              label="전환 시간"
              min={0}
              max={30}
              value={Math.round(cfg.trans * 10)}
              format={(v) => (v / 10).toFixed(1) + "s"}
              onChange={(v) => setCfg((p) => ({ ...p, trans: v / 10 }))}
            />
          </div>
        </div>

        {/* 프리셋 */}
        <div className={styles.sec}>
          <h4>프리셋 (이 브라우저에 저장됨)</h4>
          <div className={styles.bar}>
            <select value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)}>
              <option value="">{presets.length ? "프리셋 선택" : "저장된 프리셋 없음"}</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className={`${styles.btn} ${styles.btnSub}`} onClick={handleLoadPreset}>
              불러오기
            </button>
            <input className={styles.nameInput} type="text" placeholder="프리셋 이름" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            <button className={styles.btn} onClick={handleSavePreset}>
              저장
            </button>
            <button className={`${styles.btn} ${styles.btnSub}`} onClick={handleDeletePreset}>
              삭제
            </button>
          </div>
          <div className={styles.status}>{status}</div>
        </div>

        {/* 설정 코드 */}
        <div className={styles.sec}>
          <h4>설정 코드로 뽑기</h4>
          <textarea className={styles.code} readOnly value={embedCode} />
          <div className={styles.bar}>
            <button className={styles.btn} onClick={copyEmbed}>
              📋 복사
            </button>
          </div>
          <p className={styles.hint}>
            기끽이넷 안의 다른 페이지에서는 이 JSON을 &lt;Neonsign input=&#123;...&#125; /&gt; 컴포넌트에 그대로 넣으면 같은 전광판이 돕니다.
          </p>
        </div>

        {/* 코드 불러오기 */}
        <div className={styles.sec}>
          <h4>코드 불러오기</h4>
          <textarea
            className={styles.code}
            placeholder="여기서 뽑았던 설정 코드(JSON)를 붙여넣으세요"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className={styles.bar}>
            <button className={styles.btn} onClick={handleImport}>
              편집기로 불러오기
            </button>
            <span className={styles.status}>{importStatus}</span>
          </div>
          <p className={styles.hint}>붙여넣은 코드는 실행하지 않고 읽기만 합니다. JSON, &quot;문구&quot;, [&quot;문구1&quot;,&quot;문구2&quot;] 형태를 받습니다.</p>
        </div>
      </div>
    </div>
  );
}
