"use client";

import React, { useRef, useEffect, useState } from "react";

export default function Rocketgame() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const keyUpRef = useRef(null);
  const keyLeftRef = useRef(null);
  const keyRightRef = useRef(null);
  const hintRef = useRef(null);

  const rocketRef = useRef(null);
  const particlesRef = useRef([]);
  const starsRef = useRef([]);
  const keysRef = useRef({ up: false, left: false, right: false });
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [stat, setStat] = useState({ alt: 0, vel: "0.0", fuel: 100 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");

    let W, H, DPR;
    let stars = [];
    let particles = [];
    let rocket;
    let hintShown = true;

    const GRAVITY = 42;
    const MAIN_THRUST = 95;
    const SIDE_TORQUE = 3.2;
    const ANGULAR_DAMPING = 0.985;
    const LINEAR_DAMPING = 0.999;
    const FUEL_MAIN_RATE = 9;
    const FUEL_SIDE_RATE = 4;

    function groundY() {
      return H - 70;
    }

    function resize() {
      DPR = window.devicePixelRatio || 1;
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      sizeRef.current = { w: W, h: H };
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      makeStars();
    }

    function makeStars() {
      stars = [];
      const count = Math.floor((W * H) / 9000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.3 + 0.2,
          tw: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.02 + 0.005,
        });
      }
    }

    function resetRocket() {
      rocket = {
        x: W / 2,
        y: H * 0.32,
        vx: (Math.random() - 0.5) * 20,
        vy: 0,
        angle: 0,
        angVel: 0,
        len: 74,
        w: 22,
        fuel: 100,
        landed: false,
        exploded: false,
      };
      particles = [];
    }

    function spawnParticle(px, py, dirAngle, spread, speed, life, size, kind) {
      const a = dirAngle + (Math.random() - 0.5) * spread;
      const s = speed * (0.6 + Math.random() * 0.7);
      particles.push({
        x: px,
        y: py,
        vx: Math.sin(a) * s,
        vy: Math.cos(a) * s,
        life: life * (0.7 + Math.random() * 0.6),
        maxLife: life,
        size: size * (0.7 + Math.random() * 0.6),
        kind,
      });
    }

    // ---------- input ----------
    const keys = keysRef.current;

    function setKey(name, val) {
      keys[name] = val;
      const el = { up: keyUpRef.current, left: keyLeftRef.current, right: keyRightRef.current }[name];
      if (el) el.classList.toggle("active", val);
      if (val && hintShown) {
        hintShown = false;
        if (hintRef.current) hintRef.current.style.opacity = "0";
      }
    }

    function onKeyDown(e) {
      if (e.key === "ArrowUp") { setKey("up", true); e.preventDefault(); }
      if (e.key === "ArrowLeft") { setKey("left", true); e.preventDefault(); }
      if (e.key === "ArrowRight") { setKey("right", true); e.preventDefault(); }
      if (e.key === "r" || e.key === "R") resetRocket();
    }
    function onKeyUp(e) {
      if (e.key === "ArrowUp") setKey("up", false);
      if (e.key === "ArrowLeft") setKey("left", false);
      if (e.key === "ArrowRight") setKey("right", false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", resize);

    // touch support
    const touchCleanups = [];
    function bindTouch(el, name) {
      if (!el) return;
      const on = (e) => { e.preventDefault(); setKey(name, true); };
      const off = (e) => { e.preventDefault(); setKey(name, false); };
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
      el.addEventListener("touchstart", on, { passive: false });
      el.addEventListener("touchend", off, { passive: false });
      touchCleanups.push(() => {
        el.removeEventListener("mousedown", on);
        el.removeEventListener("mouseup", off);
        el.removeEventListener("mouseleave", off);
        el.removeEventListener("touchstart", on);
        el.removeEventListener("touchend", off);
      });
    }
    bindTouch(keyUpRef.current, "up");
    bindTouch(keyLeftRef.current, "left");
    bindTouch(keyRightRef.current, "right");

    // ---------- drawing ----------
    function drawStars() {
      for (const s of stars) {
        s.tw += s.speed;
        const alpha = 0.35 + Math.sin(s.tw) * 0.35 + 0.3;
        ctx.beginPath();
        ctx.fillStyle = `rgba(231,233,244,${Math.max(0.1, Math.min(1, alpha))})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawGround() {
      const gy = groundY();
      const grad = ctx.createLinearGradient(0, gy, 0, H);
      grad.addColorStop(0, "#141c33");
      grad.addColorStop(1, "#060912");
      ctx.fillStyle = grad;
      ctx.fillRect(0, gy, W, H - gy);

      ctx.strokeStyle = "rgba(110,231,255,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();

      ctx.strokeStyle = "rgba(110,231,255,0.12)";
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x - 14, gy + 18);
        ctx.stroke();
      }
    }

    function drawRocket(r) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);

      const len = r.len, w = r.w;
      const noseLen = len * 0.42;

      ctx.beginPath();
      ctx.moveTo(0, -len / 2);
      ctx.lineTo(w / 2, -len / 2 + noseLen);
      ctx.lineTo(w / 2, len / 2);
      ctx.lineTo(w / 2 + 10, len / 2 + 14);
      ctx.lineTo(w / 2 - 4, len / 2);
      ctx.lineTo(-(w / 2 - 4), len / 2);
      ctx.lineTo(-(w / 2 + 10), len / 2 + 14);
      ctx.lineTo(-w / 2, len / 2);
      ctx.lineTo(-w / 2, -len / 2 + noseLen);
      ctx.closePath();

      const bodyGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      bodyGrad.addColorStop(0, "#c9cdda");
      bodyGrad.addColorStop(0.5, "#f1f1f4");
      bodyGrad.addColorStop(1, "#9ba1b5");
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.strokeStyle = "#0e1526";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -len / 2 + noseLen + 10, w * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "#6ee7ff";
      ctx.fill();
      ctx.strokeStyle = "#0e1526";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#3a4160";
      ctx.fillRect(-w / 2 - 6, -len / 2 + noseLen + 2, 6, 14);
      ctx.fillRect(w / 2, -len / 2 + noseLen + 2, 6, 14);

      ctx.restore();
    }

    function drawParticles() {
      for (const p of particles) {
        const t = p.life / p.maxLife;
        let color;
        if (p.kind === "main") {
          if (t > 0.66) color = `rgba(255,243,196,${t})`;
          else if (t > 0.3) color = `rgba(255,157,61,${t})`;
          else color = `rgba(255,59,59,${t})`;
        } else {
          color = `rgba(110,231,255,${t * 0.9})`;
        }
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---------- physics ----------
    function step(dt) {
      if (!rocket.landed && !rocket.exploded) {
        rocket.vy += GRAVITY * dt;

        if (keys.up && rocket.fuel > 0) {
          const thrustAngle = rocket.angle;
          rocket.vx += Math.sin(thrustAngle) * MAIN_THRUST * dt;
          rocket.vy -= Math.cos(thrustAngle) * MAIN_THRUST * dt;
          rocket.fuel = Math.max(0, rocket.fuel - FUEL_MAIN_RATE * dt);

          const px = rocket.x + Math.sin(rocket.angle) * (rocket.len / 2);
          const py = rocket.y + Math.cos(rocket.angle) * (rocket.len / 2);
          for (let i = 0; i < 3; i++) {
            spawnParticle(px, py, rocket.angle + Math.PI, 0.5, 130, 0.55, 7, "main");
          }
        }

        if (keys.left && rocket.fuel > 0) {
          rocket.angVel -= SIDE_TORQUE * dt;
          rocket.fuel = Math.max(0, rocket.fuel - FUEL_SIDE_RATE * dt);
          const px = rocket.x + Math.cos(rocket.angle) * (rocket.w / 2 + 8);
          const py = rocket.y - Math.sin(rocket.angle) * (rocket.w / 2 + 8);
          spawnParticle(px, py, rocket.angle + Math.PI / 2, 0.6, 70, 0.35, 4, "side");
        }
        if (keys.right && rocket.fuel > 0) {
          rocket.angVel += SIDE_TORQUE * dt;
          rocket.fuel = Math.max(0, rocket.fuel - FUEL_SIDE_RATE * dt);
          const px = rocket.x - Math.cos(rocket.angle) * (rocket.w / 2 + 8);
          const py = rocket.y + Math.sin(rocket.angle) * (rocket.w / 2 + 8);
          spawnParticle(px, py, rocket.angle - Math.PI / 2, 0.6, 70, 0.35, 4, "side");
        }

        rocket.angVel *= ANGULAR_DAMPING;
        rocket.angle += rocket.angVel * dt;
        rocket.vx *= LINEAR_DAMPING;
        rocket.x += rocket.vx * dt;
        rocket.y += rocket.vy * dt;

        if (rocket.x < 20) { rocket.x = 20; rocket.vx *= -0.4; }
        if (rocket.x > W - 20) { rocket.x = W - 20; rocket.vx *= -0.4; }

        const gy = groundY();
        if (rocket.y + rocket.len / 2 > gy) {
          const speed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
          const uprightness = Math.abs(Math.cos(rocket.angle));
          if (speed < 60 && uprightness > 0.85) {
            rocket.y = gy - rocket.len / 2;
            rocket.vy = 0; rocket.vx *= 0.8; rocket.angVel = 0;
            rocket.landed = true;
          } else {
            rocket.exploded = true;
            for (let i = 0; i < 40; i++) {
              spawnParticle(rocket.x, rocket.y, Math.random() * Math.PI * 2, Math.PI * 2, 160, 0.9, 8, "main");
            }
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 60 * dt * 0.3;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }

    // ---------- init + loop ----------
    resize();
    resetRocket();
    lastRef.current = performance.now();

    function frame(now) {
      const dt = Math.min(0.033, (now - lastRef.current) / 1000);
      lastRef.current = now;

      ctx.clearRect(0, 0, W, H);

      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#060912");
      bgGrad.addColorStop(1, "#0b1230");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      drawStars();
      drawGround();

      step(dt);
      drawParticles();
      if (!rocket.exploded) drawRocket(rocket);

      const alt = Math.max(0, Math.round(groundY() - (rocket.y + rocket.len / 2)));
      const vel = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
      setStat({ alt, vel: vel.toFixed(1), fuel: Math.round(rocket.fuel) });

      if (rocket.exploded && particles.length === 0) {
        setTimeout(resetRocket, 300);
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    // ---------- cleanup: 이게 없으면 리렌더/언마운트마다 루프가 중복 생성됨 ----------
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      touchCleanups.forEach((fn) => fn());
    };
  }, []); // 빈 배열: 마운트 시 한 번만 실행

  return (
    <div ref={wrapRef} className="rocket-wrap">
      <style>{`
        .rocket-wrap {
          position: relative;
          width: 100%;
          height: 100vh;
          background: #060912;
          font-family: 'Space Grotesk', sans-serif;
          color: #e7e9f4;
          overflow: hidden;
        }
        .rocket-wrap canvas { display: block; width: 100%; height: 100%; }
        .hud {
          position: absolute; top: 0; left: 0; right: 0;
          padding: 22px 26px;
          display: flex; justify-content: space-between; align-items: flex-start;
          pointer-events: none;
        }
        .hud-title { font-weight: 700; font-size: 20px; letter-spacing: 0.02em; }
        .hud-title .sub {
          display: block; margin-top: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 400; font-size: 11px;
          letter-spacing: 0.12em; color: #7b84a8; text-transform: uppercase;
        }
        .hud-stats {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; color: #7b84a8; text-align: right;
          line-height: 1.7; letter-spacing: 0.03em;
        }
        .hud-stats b { color: #6ee7ff; font-weight: 600; }
        .controls {
          position: absolute; bottom: 26px; left: 0; right: 0;
          display: flex; justify-content: center; align-items: center; gap: 10px;
        }
        .key {
          width: 46px; height: 46px; border-radius: 10px;
          border: 1px solid #232c47;
          background: rgba(14,21,38,0.85);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; color: #7b84a8;
          transition: all 0.08s ease;
          pointer-events: auto;
        }
        .key.active {
          border-color: #ff9d3d; color: #fff3c4;
          background: rgba(255,157,61,0.15);
          box-shadow: 0 0 14px rgba(255,157,61,0.35);
          transform: scale(1.06);
        }
        .hint {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%);
          text-align: center; pointer-events: none;
          transition: opacity 0.4s ease;
        }
        .hint .arrow-line {
          font-size: 13px; color: #7b84a8;
          font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em;
        }
        .hint b { color: #6ee7ff; }
        .reset-note {
          position: absolute; bottom: 24px; right: 26px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px; color: #7b84a8; letter-spacing: 0.08em;
          pointer-events: none;
        }
      `}</style>

      <canvas ref={canvasRef} />

      <div className="hud">
        <div className="hud-title">
          PHYSICS ROCKET
          <span className="sub">canvas 기반 물리엔진 화면</span>
        </div>
        <div className="hud-stats">
          ALT <b>{stat.alt}</b> m<br />
          VEL <b>{stat.vel}</b> m/s<br />
          FUEL <b>{stat.fuel}</b>%
        </div>
      </div>

      <div className="hint" ref={hintRef}>
        <div className="arrow-line">↑ <b>메인 추진기</b> · ← → <b>자세 제어 추진기</b></div>
      </div>

      <div className="controls">
        <div className="key" ref={keyLeftRef}>←</div>
        <div className="key" ref={keyUpRef}>↑</div>
        <div className="key" ref={keyRightRef}>→</div>
      </div>

      <div className="reset-note">R — 리셋</div>
    </div>
  );
}