const { useState, useEffect, useRef } = React;

// ==========================================
// 模块一：单摆演示 2.0 (完整保留 5° 近似与磁性吸附)
// ==========================================
const PendulumSim = () => {
  const [params, setParams] = useState({ mass: 1.0, L: 1.0, amplitudeDeg: 5 });
  const g = 9.8; 
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); 
  const [dragMode, setDragMode] = useState('ideal');
  const [txDragMode, setTxDragMode] = useState('playhead'); 
  const [mainZoom, setMainZoom] = useState(1.0);

  const physics = useRef({
    theta: 5 * Math.PI / 180, omegaVel: 0.0, alpha: 0.0, t: 0.0, 
    isDragging: false, dragOffsetAngle: 0, isScrubbing: false, txStartT: 0, 
    isTXWaveDragging: false, dragStartX: 0, dragStartVirtualT: 0, snapType: null, isPlaying: true 
  });
  const history = useRef([]); 

  const mainCanvasRef = useRef(null);
  const txGraphRef = useRef(null);
  const uiRefs = {
    theta: useRef(null), x: useRef(null), omegaVel: useRef(null), force: useRef(null),
    a: useRef(null), kE: useRef(null), pE: useRef(null), totalE: useRef(null),
    kEBar: useRef(null), pEBar: useRef(null)
  };
  const requestRef = useRef(null);
  const lastTimeRef = useRef(null);
  const scale = 180; 

  const omega = Math.sqrt(g / params.L);
  const period = (2 * Math.PI / omega).toFixed(2);

  const togglePlay = () => {
    physics.current.isPlaying = !physics.current.isPlaying;
    setIsPlaying(physics.current.isPlaying);
  };

  const resetSystem = () => {
    physics.current.t = 0;
    if (dragMode === 'ideal') {
      physics.current.theta = params.amplitudeDeg * Math.PI / 180;
    } else {
      physics.current.theta = 20 * Math.PI / 180;
    }
    physics.current.omegaVel = 0;
    physics.current.alpha = 0;
    physics.current.snapType = null;
    history.current = [];
    physics.current.isPlaying = false; 
    setIsPlaying(false);
  };

  const getMouseX = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    return (clientX - rect.left) * (canvas.width / rect.width);
  };
  const getMouseY = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return (clientY - rect.top) * (canvas.height / rect.height);
  };

  const handlePointerDown = (e) => {
    const canvas = mainCanvasRef.current;
    const mouseX = getMouseX(e, canvas);
    const mouseY = getMouseY(e, canvas);
    
    const basePivotY = 30;
    const L_base_px = params.L * scale;
    const eqY = basePivotY + L_base_px;
    const L_px = L_base_px * mainZoom;
    const pivotY = eqY - L_px;
    const pivotX = canvas.width / 2;
    const bobX = pivotX + L_px * Math.sin(physics.current.theta);
    const bobY = pivotY + L_px * Math.cos(physics.current.theta);
    const hitRadius = 60 * Math.max(1, Math.sqrt(mainZoom));

    if (Math.abs(mouseX - bobX) < hitRadius && Math.abs(mouseY - bobY) < hitRadius) {
      physics.current.isDragging = true;
      const mouseAngle = Math.atan2(mouseX - pivotX, mouseY - pivotY);
      physics.current.dragOffsetAngle = physics.current.theta - mouseAngle; 
      physics.current.isPlaying = false;
      setIsPlaying(false);
      physics.current.omegaVel = 0; 
      physics.current.snapType = null;
      if (dragMode === 'real') {
        if (history.current.length > 0 && history.current[history.current.length - 1].t > physics.current.t) {
          history.current = history.current.filter(p => p.t <= physics.current.t);
        }
      }
      document.body.style.cursor = 'grabbing';
    }
  };

  const handlePointerMove = (e) => {
    const canvas = mainCanvasRef.current;
    const mouseY = getMouseY(e, canvas);
    const mouseX = getMouseX(e, canvas);
    const basePivotY = 30;
    const L_base_px = params.L * scale;
    const eqY = basePivotY + L_base_px;
    const L_px = L_base_px * mainZoom;
    const pivotY = eqY - L_px;
    const pivotX = canvas.width / 2;
    
    if (!physics.current.isDragging) {
      const bobX = pivotX + L_px * Math.sin(physics.current.theta);
      const bobY = pivotY + L_px * Math.cos(physics.current.theta);
      const hitRadius = 60 * Math.max(1, Math.sqrt(mainZoom));
      canvas.style.cursor = (Math.abs(mouseX - bobX) < hitRadius && Math.abs(mouseY - bobY) < hitRadius) ? 'grab' : 'default';
      return;
    }

    const rawMouseAngle = Math.atan2(mouseX - pivotX, mouseY - pivotY);
    let newTheta = rawMouseAngle + (physics.current.dragOffsetAngle || 0);
    
    if (dragMode === 'ideal') {
      const ampRad = params.amplitudeDeg * Math.PI / 180;
      newTheta = Math.max(-ampRad, Math.min(ampRad, newTheta));
      let phase = Math.acos(newTheta / ampRad);
      let prevPhase = (omega * physics.current.t) % (2 * Math.PI);
      if (prevPhase < 0) prevPhase += 2 * Math.PI;
      let dist1 = Math.abs(prevPhase - phase);
      dist1 = Math.min(dist1, 2 * Math.PI - dist1);
      let dist2 = Math.abs(prevPhase - (2 * Math.PI - phase));
      dist2 = Math.min(dist2, 2 * Math.PI - dist2);
      let finalPhase = dist1 < dist2 ? phase : (2 * Math.PI - phase);
      let angleDiff = finalPhase - prevPhase;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      let newTotalAngle = omega * physics.current.t + angleDiff;
      if (newTotalAngle < 0) newTotalAngle = 0; 
      physics.current.t = newTotalAngle / omega;
      physics.current.theta = ampRad * Math.cos(newTotalAngle);
      physics.current.omegaVel = -ampRad * omega * Math.sin(newTotalAngle);
      physics.current.alpha = -ampRad * omega * omega * Math.cos(newTotalAngle);
    } else {
      if (newTheta > Math.PI/2) newTheta = Math.PI/2;
      if (newTheta < -Math.PI/2) newTheta = -Math.PI/2;
      physics.current.theta = newTheta;
      physics.current.omegaVel = 0; 
    }
  };

  const handlePointerUp = () => {
    if (physics.current.isDragging) {
      physics.current.isDragging = false;
      document.body.style.cursor = 'default';
    }
  };

  const getSnappedT = (rawT, timeSpan, graphW) => {
    const snapThresholdTime = timeSpan * (10 / graphW);
    let snappedT = rawT;
    let snapType = null; 

    if (dragMode === 'ideal') {
      const T_quarter = (Math.PI / 2) / omega;
      const n = Math.round(rawT / T_quarter);
      const candidateT = n * T_quarter;
      if (Math.abs(rawT - candidateT) < snapThresholdTime) {
        snappedT = candidateT;
        snapType = (n % 2 === 0) ? 'peak' : 'eq'; 
      }
    } else {
      let minDiff = snapThresholdTime;
      for (let i = 1; i < history.current.length; i++) {
        const p1 = history.current[i-1];
        const p2 = history.current[i];
        if (p1.theta * p2.theta <= 0) {
            const ratio = Math.abs(p1.theta) / (Math.abs(p1.theta) + Math.abs(p2.theta) || 1);
            const t_cross = p1.t + ratio * (p2.t - p1.t);
            if (Math.abs(rawT - t_cross) < minDiff) { minDiff = Math.abs(rawT - t_cross); snappedT = t_cross; snapType = 'eq'; }
        }
        if (p1.omegaVel * p2.omegaVel <= 0) {
            const ratio = Math.abs(p1.omegaVel) / (Math.abs(p1.omegaVel) + Math.abs(p2.omegaVel) || 1);
            const t_cross = p1.t + ratio * (p2.t - p1.t);
            if (Math.abs(rawT - t_cross) < minDiff) { minDiff = Math.abs(rawT - t_cross); snappedT = t_cross; snapType = 'peak'; }
        }
      }
    }
    return { snappedT, snapType };
  };

  const handleTXPointerDown = (e) => {
    if (dragMode === 'real' && history.current.length < 2) return;
    const canvas = txGraphRef.current;
    physics.current.isPlaying = false;
    setIsPlaying(false);

    if (txDragMode === 'playhead') {
      physics.current.isScrubbing = true;
      document.body.style.cursor = 'ew-resize';
      const timeSpan = 4.0;
      if (dragMode === 'ideal') {
        physics.current.txStartT = Math.max(0, physics.current.t - timeSpan * 0.75);
      } else {
        const latestT = history.current[history.current.length - 1].t;
        physics.current.txStartT = Math.max(0, latestT - timeSpan);
      }
      handleTXPointerMove(e);
    } else {
      physics.current.isTXWaveDragging = true;
      physics.current.dragStartX = getMouseX(e, canvas);
      physics.current.dragStartVirtualT = physics.current.t;
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleTXPointerMove = (e) => {
    const canvas = txGraphRef.current;
    const mouseX = getMouseX(e, canvas);
    const padding = 35;
    const graphW = canvas.width - padding - 20;
    const timeSpan = 4.0;
    const ampRad = params.amplitudeDeg * Math.PI / 180;
    let targetT = physics.current.t;

    if (txDragMode === 'playhead' && physics.current.isScrubbing) {
      const startT = physics.current.txStartT;
      let clampedX = Math.max(padding, Math.min(mouseX, padding + graphW));
      let rawTargetT = startT + ((clampedX - padding) / graphW) * timeSpan;
      const { snappedT, snapType } = getSnappedT(rawTargetT, timeSpan, graphW);
      targetT = snappedT; physics.current.snapType = snapType;
    } else if (txDragMode === 'wave' && physics.current.isTXWaveDragging) {
      const totalDeltaX = mouseX - physics.current.dragStartX;
      const totalDeltaT = -(totalDeltaX / graphW) * timeSpan; 
      let rawT = physics.current.dragStartVirtualT + totalDeltaT;
      const { snappedT, snapType } = getSnappedT(rawT, timeSpan, graphW);
      targetT = snappedT; physics.current.snapType = snapType;
    } else { return; }

    if (dragMode === 'ideal') {
      physics.current.t = Math.max(0, targetT);
      physics.current.theta = ampRad * Math.cos(omega * physics.current.t);
      physics.current.omegaVel = -ampRad * omega * Math.sin(omega * physics.current.t);
      physics.current.alpha = -ampRad * omega * omega * Math.cos(omega * physics.current.t);
    } else {
      const latestT = history.current.length > 0 ? history.current[history.current.length - 1].t : 0;
      targetT = Math.min(Math.max(targetT, history.current[0]?.t || 0), latestT);
      let closestPt = history.current[0];
      let minDiff = Infinity;
      for (let i = 0; i < history.current.length; i++) {
        let diff = Math.abs(history.current[i].t - targetT);
        if (diff < minDiff) { minDiff = diff; closestPt = history.current[i]; }
      }
      if (closestPt) {
        physics.current.t = closestPt.t; physics.current.theta = closestPt.theta;
        physics.current.omegaVel = closestPt.omegaVel; physics.current.alpha = closestPt.alpha;
      }
    }
  };

  const handleTXPointerUp = () => {
    physics.current.isScrubbing = false; physics.current.isTXWaveDragging = false; physics.current.snapType = null;
    document.body.style.cursor = 'default';
  };

  const drawArrow = (ctx, fromX, fromY, toX, toY, color, width = 3) => {
    if (Math.abs(fromX - toX) < 1 && Math.abs(fromY - toY) < 1) return;
    const headlen = 10; const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6)); ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };

  const animate = (time) => {
    if (!mainCanvasRef.current || !txGraphRef.current) {
      lastTimeRef.current = time; requestRef.current = requestAnimationFrame(animate); return;
    }

    if (lastTimeRef.current != null) {
      const delta = (time - lastTimeRef.current) / 1000;
      const dt = Math.min(delta, 0.05) * playbackSpeed; 
      const state = physics.current;
      const ampRad = params.amplitudeDeg * Math.PI / 180;
      const isAnyActive = state.isDragging || state.isScrubbing || state.isTXWaveDragging;
      
      if (state.isPlaying && !isAnyActive) {
        if (dragMode === 'ideal') {
          state.t += dt; state.theta = ampRad * Math.cos(omega * state.t);
          state.omegaVel = -ampRad * omega * Math.sin(omega * state.t); state.alpha = -ampRad * omega * omega * Math.cos(omega * state.t);
        } else {
          if (history.current.length > 0 && history.current[history.current.length - 1].t > state.t) {
            history.current = history.current.filter(p => p.t <= state.t);
          }
          state.alpha = -(g / params.L) * Math.sin(state.theta);
          state.omegaVel += state.alpha * dt; state.theta += state.omegaVel * dt; state.t += dt;
          if (history.current.length === 0 || state.t - history.current[history.current.length - 1].t > 0.015) {
            history.current.push({ t: state.t, theta: state.theta, omegaVel: state.omegaVel, alpha: state.alpha });
            if (history.current.length > 500) history.current.shift(); 
          }
        }
      } else if (state.isDragging && dragMode === 'real') {
        state.t += dt; state.alpha = -(g / params.L) * Math.sin(state.theta); state.omegaVel = 0;
        if (history.current.length === 0 || state.t - history.current[history.current.length - 1].t > 0.015) {
          history.current.push({ t: state.t, theta: state.theta, omegaVel: state.omegaVel, alpha: state.alpha });
          if (history.current.length > 500) history.current.shift(); 
        }
      }

      const currentX = params.L * Math.sin(state.theta);
      const height = params.L * (1 - Math.cos(state.theta));
      const pE = params.mass * g * height;
      const velocity = params.L * state.omegaVel;
      const kE = 0.5 * params.mass * Math.pow(velocity, 2);
      const totalE = kE + pE;
      const accelT = state.alpha * params.L;
      const refHeight = params.L * (1 - Math.cos(dragMode === 'ideal' ? ampRad : Math.PI/2));
      const maxERef = Math.max(totalE, params.mass * g * refHeight); 

      if (uiRefs.theta.current) uiRefs.theta.current.textContent = `${(state.theta * 180 / Math.PI).toFixed(1)}°`;
      if (uiRefs.x.current) uiRefs.x.current.textContent = currentX.toFixed(2);
      if (uiRefs.omegaVel.current) uiRefs.omegaVel.current.textContent = state.omegaVel.toFixed(2);
      if (uiRefs.a.current) uiRefs.a.current.textContent = accelT.toFixed(2);
      if (uiRefs.force.current) uiRefs.force.current.textContent = (-params.mass * g * Math.sin(state.theta)).toFixed(2);
      if (uiRefs.kE.current) uiRefs.kE.current.textContent = kE.toFixed(1);
      if (uiRefs.pE.current) uiRefs.pE.current.textContent = pE.toFixed(1);
      if (uiRefs.totalE.current) uiRefs.totalE.current.textContent = totalE.toFixed(1);
      if (uiRefs.kEBar.current) uiRefs.kEBar.current.style.width = `${(kE / maxERef) * 100}%`;
      if (uiRefs.pEBar.current) uiRefs.pEBar.current.style.width = `${(pE / maxERef) * 100}%`;

      const mCtx = mainCanvasRef.current.getContext('2d');
      const w = mainCanvasRef.current.width, h = mainCanvasRef.current.height;
      const pivotX = w / 2; const basePivotY = 30; const L_base_px = params.L * scale;
      const eqY = basePivotY + L_base_px; const L_px = L_base_px * mainZoom; const pivotY = eqY - L_px; 
      
      mCtx.clearRect(0, 0, w, h);
      if (pivotY >= 0) {
        mCtx.fillStyle = '#1e293b'; mCtx.fillRect(0, 0, w, pivotY);
        mCtx.beginPath(); mCtx.moveTo(0, pivotY); mCtx.lineTo(w, pivotY); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 3; mCtx.stroke(); 
        mCtx.beginPath(); mCtx.arc(pivotX, pivotY, 4, 0, Math.PI * 2); mCtx.fillStyle = '#94a3b8'; mCtx.fill();
      }
      mCtx.beginPath(); mCtx.setLineDash([5, 5]); mCtx.moveTo(pivotX, Math.max(0, pivotY)); mCtx.lineTo(pivotX, h - 20); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 1; mCtx.stroke(); mCtx.setLineDash([]);
      mCtx.fillStyle = '#64748b'; mCtx.font = '12px sans-serif'; mCtx.fillText('x = 0', pivotX + 10, h - 25);
      
      if (dragMode === 'ideal') {
        const x_max_px = L_px * Math.sin(ampRad);
        mCtx.beginPath(); mCtx.setLineDash([3, 3]); mCtx.moveTo(pivotX - x_max_px, Math.max(0, pivotY)); mCtx.lineTo(pivotX - x_max_px, h - 20);
        mCtx.moveTo(pivotX + x_max_px, Math.max(0, pivotY)); mCtx.lineTo(pivotX + x_max_px, h - 20);
        mCtx.strokeStyle = 'rgba(168, 85, 247, 0.2)'; mCtx.lineWidth = 1.5; mCtx.stroke(); mCtx.setLineDash([]);
        mCtx.fillStyle = 'rgba(168, 85, 247, 0.6)'; mCtx.font = '10px sans-serif'; mCtx.fillText('-X_max', pivotX - x_max_px - 40, h - 35); mCtx.fillText('+X_max', pivotX + x_max_px + 5, h - 35);
        mCtx.beginPath(); mCtx.arc(pivotX, pivotY, L_px, Math.PI/2 - ampRad, Math.PI/2 + ampRad); mCtx.strokeStyle = 'rgba(168, 85, 247, 0.15)'; mCtx.lineWidth = 3; mCtx.stroke();
      }
      
      const bobX = pivotX + L_px * Math.sin(state.theta); const bobY = pivotY + L_px * Math.cos(state.theta);
      mCtx.beginPath(); mCtx.moveTo(pivotX, Math.max(0, pivotY)); mCtx.lineTo(bobX, bobY); mCtx.strokeStyle = '#94a3b8'; mCtx.lineWidth = 2 * Math.sqrt(mainZoom); mCtx.stroke();
      const bobRadius = (15 + params.mass * 4) * Math.sqrt(mainZoom); 
      mCtx.beginPath(); mCtx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2);
      mCtx.fillStyle = isAnyActive ? (dragMode === 'ideal' ? '#a855f7' : '#f59e0b') : (!state.isPlaying ? '#64748b' : '#3b82f6');
      mCtx.shadowColor = 'rgba(0,0,0,0.4)'; mCtx.shadowBlur = 12 * mainZoom; mCtx.shadowOffsetY = 4 * mainZoom; mCtx.fill(); mCtx.shadowColor = 'transparent';
      if (Math.abs(bobX - pivotX) > 5) {
        mCtx.beginPath(); mCtx.setLineDash([4, 4]); mCtx.moveTo(bobX, bobY); mCtx.lineTo(bobX, Math.max(0, pivotY)); mCtx.strokeStyle = 'rgba(59, 130, 246, 0.4)'; mCtx.lineWidth = 1.5; mCtx.stroke(); mCtx.setLineDash([]);
      }
      if (isAnyActive) {
        mCtx.fillStyle = '#cbd5e1'; mCtx.font = '12px sans-serif'; mCtx.fillText(`x: ${currentX.toFixed(2)}m`, bobX + bobRadius + 8, bobY + 4);
      } else {
        const vx = state.omegaVel * params.L * Math.cos(state.theta); const vy = -state.omegaVel * params.L * Math.sin(state.theta);
        if (Math.abs(state.omegaVel) > 0.1) drawArrow(mCtx, bobX, bobY, bobX + vx * 20 * mainZoom, bobY + vy * 20 * mainZoom, '#10b981', 3);
        const ax = accelT * Math.cos(state.theta); const ay = -accelT * Math.sin(state.theta);
        if (Math.abs(accelT) > 0.1) drawArrow(mCtx, bobX, bobY, bobX + ax * 5 * mainZoom, bobY + ay * 5 * mainZoom, '#ef4444', 3);
      }

      const txCtx = txGraphRef.current.getContext('2d');
      const txW = txGraphRef.current.width, txH = txGraphRef.current.height;
      txCtx.clearRect(0, 0, txW, txH); const padding = 35; const txOriginY = txH / 2;
      txCtx.beginPath(); txCtx.moveTo(padding, txOriginY); txCtx.lineTo(txW - 10, txOriginY); txCtx.moveTo(padding, 10); txCtx.lineTo(padding, txH - 10);
      txCtx.strokeStyle = '#334155'; txCtx.lineWidth = 1; txCtx.stroke();
      txCtx.fillStyle = '#94a3b8'; txCtx.font = '12px sans-serif'; txCtx.fillText('时间 t', txW - 40, txOriginY + 15); txCtx.fillText('位移 x (m)', 5, 15);

      const timeSpan = 4.0; let startT; const maxXDisplay = 1.5; 
      const plotY = (x_val) => txOriginY - (x_val / maxXDisplay) * (txH / 2 - 15);
      txCtx.fillStyle = '#475569'; txCtx.font = '10px sans-serif'; txCtx.fillText('1.0', 10, plotY(1.0) + 4); txCtx.fillText('-1.0', 5, plotY(-1.0) + 4);
      txCtx.beginPath(); txCtx.setLineDash([2, 4]); txCtx.moveTo(padding, plotY(1.0)); txCtx.lineTo(txW-10, plotY(1.0)); txCtx.moveTo(padding, plotY(-1.0)); txCtx.lineTo(txW-10, plotY(-1.0)); txCtx.strokeStyle = '#1e293b'; txCtx.stroke(); txCtx.setLineDash([]);
      
      if (dragMode === 'ideal') {
        startT = (state.isScrubbing && txDragMode === 'playhead') ? state.txStartT : Math.max(0, state.t - timeSpan * 0.75); 
        txCtx.beginPath();
        for (let px = padding; px <= txW - 10; px++) {
          let t_point = startT + ((px - padding) / (txW - padding - 20)) * timeSpan;
          if (t_point < 0) continue;
          let th_point = ampRad * Math.cos(omega * t_point); let x_point = params.L * Math.sin(th_point); let py = plotY(x_point);
          if (px === padding) txCtx.moveTo(px, py); else txCtx.lineTo(px, py);
        }
        txCtx.strokeStyle = 'rgba(168, 85, 247, 0.4)'; txCtx.lineWidth = 3; txCtx.stroke();
        txCtx.beginPath();
        for (let px = padding; px <= txW - 10; px++) {
          let t_point = startT + ((px - padding) / (txW - padding - 20)) * timeSpan;
          if (t_point < 0 || t_point > state.t) continue; 
          let th_point = ampRad * Math.cos(omega * t_point); let x_point = params.L * Math.sin(th_point); let py = plotY(x_point);
          if (px === padding || t_point === 0) txCtx.moveTo(px, py); else txCtx.lineTo(px, py);
        }
        txCtx.strokeStyle = '#9333ea'; txCtx.lineWidth = 2.5; txCtx.stroke();
      } else {
        if (history.current.length > 1) {
          if (state.isScrubbing && txDragMode === 'playhead') { startT = state.txStartT; } 
          else { const latestT = history.current[history.current.length - 1].t; startT = Math.max(0, latestT - timeSpan); }
          txCtx.beginPath();
          for (let i = 0; i < history.current.length; i++) {
            const pt = history.current[i]; if (pt.t < startT) continue;
            const px = padding + ((pt.t - startT) / timeSpan) * (txW - padding - 20); const x_point = params.L * Math.sin(pt.theta); const py = plotY(x_point); 
            if (i === 0 || history.current[i-1].t < startT) txCtx.moveTo(px, py); else txCtx.lineTo(px, py);
          }
          txCtx.strokeStyle = '#3b82f6'; txCtx.lineWidth = 2.5; txCtx.stroke();
        }
      }

      startT = startT || 0;
      const playheadX = padding + ((state.t - startT) / timeSpan) * (txW - padding - 20);
      if (playheadX >= padding && playheadX <= txW - 10) {
        const isSnapped = (state.isScrubbing || state.isTXWaveDragging) && state.snapType;
        const headColor = isSnapped ? (state.snapType === 'eq' ? '#10b981' : '#ef4444') : (dragMode === 'ideal' ? '#a855f7' : '#f59e0b');
        txCtx.beginPath(); txCtx.moveTo(playheadX, 10); txCtx.lineTo(playheadX, txH - 10);
        txCtx.strokeStyle = headColor; txCtx.lineWidth = isSnapped ? 3 : 2; txCtx.setLineDash(isSnapped ? [] : [4, 4]); txCtx.stroke(); txCtx.setLineDash([]);
        const playheadY = plotY(currentX);
        txCtx.beginPath(); txCtx.arc(playheadX, playheadY, isSnapped ? 7 : 5, 0, Math.PI * 2); txCtx.fillStyle = headColor; txCtx.fill(); txCtx.strokeStyle = '#fff'; txCtx.lineWidth = 1.5; txCtx.stroke();
        if (isSnapped) {
          txCtx.fillStyle = headColor; txCtx.font = 'bold 12px sans-serif';
          const label = state.snapType === 'eq' ? '● 平衡位置 (最低点)' : '● 最高/低点';
          txCtx.fillText(label, playheadX + 10, txOriginY - 25);
        }
      }
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [params, playbackSpeed, dragMode, txDragMode, mainZoom]);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-2xl p-5 flex flex-wrap justify-between items-center shadow-xl border border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">⏳ 沉浸式单摆：简谐近似探究模型</h1>
          <p className="text-emerald-400 font-medium text-sm mt-1.5 flex items-center gap-2"><span className="bg-emerald-900/40 px-2 py-0.5 rounded border border-emerald-800">核心考点</span> 当最大摆角 ≤ 5° 时，单摆运动可被高度近似为沿 X 轴的简谐运动！</p>
        </div>
        <div className="flex space-x-6 text-sm bg-slate-950 px-5 py-2.5 rounded-xl border border-slate-800 shadow-inner">
          <div className="text-center"><span className="block text-slate-500 text-xs font-bold mb-1">固有频率 ω</span><span className="font-mono text-blue-400 text-lg font-black">{omega.toFixed(2)}</span></div>
          <div className="text-center"><span className="block text-slate-500 text-xs font-bold mb-1">振动周期 T</span><span className="font-mono text-blue-400 text-lg font-black">{period}s</span></div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-2xl px-5 py-3 border border-slate-800 flex flex-col lg:flex-row justify-between items-center shadow-lg gap-4">
        <div className="flex items-center gap-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <span className="text-xs text-slate-400 pl-3 font-bold uppercase tracking-wider">物理引擎模式</span>
          <button onClick={() => {setDragMode('ideal'); resetSystem();}} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${dragMode === 'ideal' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-slate-400 hover:bg-slate-800'}`}>🔮 完美简谐 (公式锁定)</button>
          <button onClick={() => {setDragMode('real'); resetSystem();}} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${dragMode === 'real' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}>🖐️ 真实记录 (非线性演化)</button>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">倍速</span>
            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500 text-xs font-bold transition-colors cursor-pointer hover:bg-slate-700">
              <option value={0.25}>0.25x 极慢</option><option value={0.5}>0.5x 慢速</option><option value={1.0}>1.0x 正常</option><option value={2.0}>2.0x 快速</option>
            </select>
          </div>
          <button onClick={togglePlay} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 shadow-lg ${isPlaying ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-emerald-500 hover:bg-emerald-400 text-white'}`}>{isPlaying ? "⏸️ 暂停模拟" : "▶️ 播放模拟"}</button>
          <button onClick={resetSystem} className="flex items-center justify-center w-10 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all shadow-lg border border-slate-700" title="重置">🔄</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden relative group">
            <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md px-4 py-3 rounded-xl border border-slate-800 font-mono text-[11px] z-10 flex flex-col gap-2 min-w-[150px] shadow-2xl">
              <div className="flex justify-between items-center text-slate-300"><span>绝对偏角 θ:</span> <span className="text-white font-bold bg-slate-800 px-1.5 rounded"><span ref={uiRefs.theta}>0.0°</span></span></div>
              <div className="flex justify-between items-center text-slate-300"><span>水平位移 x:</span> <span className="text-blue-400 font-bold bg-blue-900/20 px-1.5 rounded"><span ref={uiRefs.x}>0.00</span> m</span></div>
              <div className="flex justify-between items-center text-slate-300"><span>角速度 ω:</span> <span className="text-emerald-400 font-bold bg-emerald-900/20 px-1.5 rounded"><span ref={uiRefs.omegaVel}>0.00</span> rad/s</span></div>
              <div className="flex justify-between items-center text-slate-300"><span>切向加速度 a:</span> <span className="text-red-400 font-bold bg-red-900/20 px-1.5 rounded"><span ref={uiRefs.a}>0.00</span> m/s²</span></div>
            </div>
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 z-10 shadow-lg group/zoom">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider group-hover/zoom:text-slate-200 transition-colors">🔍 物理变焦</span>
              <input type="range" min="1" max="6" step="0.1" value={mainZoom} onChange={e => setMainZoom(parseFloat(e.target.value))} className="w-24 accent-amber-500 cursor-ew-resize" title="放大查看小角度微观简谐近似"/>
              <span className="text-xs text-amber-400 font-mono font-bold w-8 text-right">{mainZoom.toFixed(1)}x</span>
            </div>
            <canvas ref={mainCanvasRef} width={800} height={420} className="w-full h-auto block cursor-grab active:cursor-grabbing bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 to-slate-900" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}/>
          </div>
          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 flex flex-col relative group shadow-xl">
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-base font-bold text-slate-200 flex items-center gap-2"><div className="w-4 h-4 rounded bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"></div> 数据图像 (时间-水平位移 X-T)</h3>
              <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 text-[10px] font-bold">
                <button onClick={() => setTxDragMode('playhead')} className={`px-3 py-1.5 rounded-md transition-colors ${txDragMode === 'playhead' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}>拖动游标</button>
                <button onClick={() => setTxDragMode('wave')} className={`px-3 py-1.5 rounded-md transition-colors ${txDragMode === 'wave' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}>拖拽波形 (调时)</button>
              </div>
            </div>
            <div className="w-full bg-slate-950 rounded-xl border border-slate-800 p-2 relative overflow-hidden h-[220px] shadow-inner">
              <div className="absolute inset-x-0 top-0 h-full flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-gradient-to-r from-transparent via-slate-900/40 to-transparent">
                 <span className="bg-slate-800/80 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg shadow-xl font-bold border border-slate-700">{txDragMode === 'playhead' ? "👈 拖拽虚线游标回溯，靠近峰谷触发【磁性吸附】👉" : "👈 直接按住波形拉扯，像卷轴一样调整时间 👉"}</span>
              </div>
              <canvas ref={txGraphRef} width={800} height={220} className="w-full h-full cursor-ew-resize relative z-10" onPointerDown={handleTXPointerDown} onPointerMove={handleTXPointerMove} onPointerUp={handleTXPointerUp} onPointerLeave={handleTXPointerUp}/>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 space-y-5">
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
            <h3 className="font-black text-slate-200 mb-5 border-b border-slate-800 pb-3 uppercase tracking-wider text-sm flex items-center gap-2">⚙️ 物理参数设定</h3>
            <div className="space-y-6">
              <div className={`p-4 rounded-xl transition-all duration-300 border ${dragMode === 'ideal' ? 'bg-purple-900/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'border-transparent bg-slate-950/50'}`}>
                <label className="flex justify-between text-xs font-bold text-slate-400 mb-3"><span className={dragMode === 'ideal' ? 'text-purple-400' : ''}>限制最大摆角 (振幅)</span> <span className="bg-slate-800 px-2 py-0.5 rounded text-white">{params.amplitudeDeg.toFixed(0)}°</span></label>
                <input type="range" min="1" max="90" step="1" value={params.amplitudeDeg} onChange={e => setParams({...params, amplitudeDeg: parseFloat(e.target.value)})} className={`w-full ${dragMode==='ideal'?'accent-purple-500':'accent-slate-600 opacity-40'}`} disabled={dragMode !== 'ideal'} />
              </div>
              <div className="bg-slate-950/50 p-4 rounded-xl border border-transparent">
                <label className="flex justify-between text-xs font-bold text-slate-400 mb-3"><span>摆球质量 (m)</span> <span className="bg-slate-800 px-2 py-0.5 rounded text-white">{params.mass.toFixed(1)} kg</span></label>
                <input type="range" min="0.5" max="5.0" step="0.1" value={params.mass} onChange={e => setParams({...params, mass: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
              </div>
              <div className="bg-slate-950/50 p-4 rounded-xl border border-transparent">
                <label className="flex justify-between text-xs font-bold text-slate-400 mb-3"><span>悬线长度 (L)</span> <span className="bg-slate-800 px-2 py-0.5 rounded text-white">{params.L.toFixed(2)} m</span></label>
                <input type="range" min="0.3" max="1.5" step="0.05" value={params.L} onChange={e => setParams({...params, L: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl">
            <h3 className="font-black text-slate-200 mb-5 border-b border-slate-800 pb-3 uppercase tracking-wider text-sm flex items-center gap-2">⚡ 能量转化深池</h3>
            <div className="space-y-5 font-mono text-sm">
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                <div className="flex justify-between text-slate-400 mb-2"><span className="font-bold">旋转动能 Eₖ</span> <span className="text-white"><span ref={uiRefs.kE} className="text-emerald-400 font-bold text-lg">0.0</span> J</span></div>
                <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner"><div ref={uiRefs.kEBar} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-none"></div></div>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                <div className="flex justify-between text-slate-400 mb-2"><span className="font-bold">重力势能 Eₚ</span> <span className="text-white"><span ref={uiRefs.pE} className="text-blue-400 font-bold text-lg">0.0</span> J</span></div>
                <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner"><div ref={uiRefs.pEBar} className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-none"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 模块二：弹簧振子 2.0 (包含横向/竖向逻辑，三项联动)
// ==========================================
const SpringSim = ({ mode = 'horizontal' }) => {
  const [params, setParams] = useState({ mass: 1.0, k: 50.0, damping: 0.0, amplitude: 2.5 });
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); 
  const [dragMode, setDragMode] = useState('ideal'); 
  const [xyDragMode, setXyDragMode] = useState('time');

  const physics = useRef({
    y: 2.5, v: 0.0, a: 0.0, t: 0.0, isDragging: false, isScrubbing: false, 
    tyStartT: 0, isXYScrubbing: false, lastXYMouseX: 0, xyOffset: 0, isPlaying: true 
  });
  const history = useRef([]); 

  const mainCanvasRef = useRef(null); const tyGraphRef = useRef(null); const xyGraphRef = useRef(null);
  const uiRefs = { y: useRef(null), v: useRef(null), a: useRef(null), force: useRef(null), kE: useRef(null), pE: useRef(null), totalE: useRef(null), kEBar: useRef(null), pEBar: useRef(null) };
  const requestRef = useRef(null); const lastTimeRef = useRef(null); 
  const scale = mode === 'horizontal' ? 100 : 55; 
  const waveSpeed = 2.0;
  const omega = Math.sqrt(params.k / params.mass); 
  const period = (2 * Math.PI / omega).toFixed(2);

  const togglePlay = () => { physics.current.isPlaying = !physics.current.isPlaying; setIsPlaying(physics.current.isPlaying); };
  const resetSystem = () => {
    physics.current.t = 0;
    if (dragMode === 'ideal') { physics.current.y = params.amplitude; } else { physics.current.y = 2.0; }
    physics.current.v = 0; physics.current.a = 0; physics.current.xyOffset = 0; history.current = [];
    physics.current.isPlaying = false; setIsPlaying(false);
  };

  const getMouseX = (e, canvas) => { const rect = canvas.getBoundingClientRect(); const clientX = e.clientX || (e.touches && e.touches[0].clientX); return (clientX - rect.left) * (canvas.width / rect.width); };
  const getMouseY = (e, canvas) => { const rect = canvas.getBoundingClientRect(); const clientY = e.clientY || (e.touches && e.touches[0].clientY); return (clientY - rect.top) * (canvas.height / rect.height); };

  const handlePointerDown = (e) => {
    const canvas = mainCanvasRef.current; const mouseX = getMouseX(e, canvas); const mouseY = getMouseY(e, canvas);
    const w = canvas.width; const h = canvas.height;
    if (mode === 'horizontal') {
      const eqX = w / 2; const blockX = eqX + physics.current.y * scale;
      if (Math.abs(mouseX - blockX) < 50) {
        physics.current.isDragging = true; physics.current.isPlaying = false; setIsPlaying(false); physics.current.v = 0; 
        if (dragMode === 'real') { if (history.current.length > 0 && history.current[history.current.length - 1].t > physics.current.t) { history.current = history.current.filter(p => p.t <= physics.current.t); } }
        document.body.style.cursor = 'grabbing';
      }
    } else {
      const eqY = h / 2; const centerX = w / 2; const blockY = eqY - physics.current.y * scale;
      if (Math.abs(mouseY - blockY) < 50 && Math.abs(mouseX - centerX) < 60) {
        physics.current.isDragging = true; physics.current.dragOffsetY = blockY - mouseY; physics.current.isPlaying = false; setIsPlaying(false); physics.current.v = 0;
        if (dragMode === 'real') { if (history.current.length > 0 && history.current[history.current.length - 1].t > physics.current.t) { history.current = history.current.filter(p => p.t <= physics.current.t); } }
        document.body.style.cursor = 'grabbing';
      }
    }
  };

  const handlePointerMove = (e) => {
    const canvas = mainCanvasRef.current; const mouseX = getMouseX(e, canvas); const mouseY = getMouseY(e, canvas);
    const w = canvas.width; const h = canvas.height;
    
    if (mode === 'horizontal') {
      if (!physics.current.isDragging) { const eqX = w / 2; const blockX = eqX + physics.current.y * scale; canvas.style.cursor = Math.abs(mouseX - blockX) < 50 ? 'grab' : 'default'; return; }
      const eqX = w / 2; let newY = (mouseX - eqX) / scale;
      if (dragMode === 'ideal') {
        const A = params.amplitude; newY = Math.max(-A, Math.min(A, newY));
        let phase = Math.acos(newY / A); let prevPhase = (omega * physics.current.t) % (2 * Math.PI); if (prevPhase < 0) prevPhase += 2 * Math.PI;
        let dist1 = Math.abs(prevPhase - phase); dist1 = Math.min(dist1, 2 * Math.PI - dist1); let dist2 = Math.abs(prevPhase - (2 * Math.PI - phase)); dist2 = Math.min(dist2, 2 * Math.PI - dist2);
        let finalPhase = dist1 < dist2 ? phase : (2 * Math.PI - phase); let angleDiff = finalPhase - prevPhase; if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI; if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        let newTotalAngle = omega * physics.current.t + angleDiff; if (newTotalAngle < 0) newTotalAngle = 0; 
        physics.current.t = newTotalAngle / omega; physics.current.y = params.amplitude * Math.cos(newTotalAngle); physics.current.v = -params.amplitude * omega * Math.sin(newTotalAngle); physics.current.a = -params.amplitude * omega * omega * Math.cos(newTotalAngle);
      } else { if (newY > 3.5) newY = 3.5; if (newY < -3.5) newY = -3.5; physics.current.y = newY; physics.current.v = 0; }
    } else {
      const eqY = h / 2; const centerX = w / 2;
      if (!physics.current.isDragging) { const blockY = eqY - physics.current.y * scale; canvas.style.cursor = (Math.abs(mouseY - blockY) < 50 && Math.abs(mouseX - centerX) < 60) ? 'grab' : 'default'; return; }
      const targetBlockY = mouseY + (physics.current.dragOffsetY || 0); let newY = (eqY - targetBlockY) / scale;
      if (dragMode === 'ideal') {
        const A = params.amplitude; newY = Math.max(-A, Math.min(A, newY));
        let phase = Math.acos(newY / A); let prevPhase = (omega * physics.current.t) % (2 * Math.PI); if (prevPhase < 0) prevPhase += 2 * Math.PI;
        let dist1 = Math.abs(prevPhase - phase); dist1 = Math.min(dist1, 2 * Math.PI - dist1); let dist2 = Math.abs(prevPhase - (2 * Math.PI - phase)); dist2 = Math.min(dist2, 2 * Math.PI - dist2);
        let finalPhase = dist1 < dist2 ? phase : (2 * Math.PI - phase); let angleDiff = finalPhase - prevPhase; if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI; if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        let newTotalAngle = omega * physics.current.t + angleDiff; if (newTotalAngle < 0) newTotalAngle = 0; 
        physics.current.t = newTotalAngle / omega; physics.current.y = params.amplitude * Math.cos(newTotalAngle); physics.current.v = -params.amplitude * omega * Math.sin(newTotalAngle); physics.current.a = -params.amplitude * omega * omega * Math.cos(newTotalAngle);
      } else { if (newY > 3.8) newY = 3.8; if (newY < -3.8) newY = -3.8; physics.current.y = newY; physics.current.v = 0; }
    }
  };

  const handlePointerUp = () => { if (physics.current.isDragging) { physics.current.isDragging = false; document.body.style.cursor = 'default'; } };

  const handleTYPointerDown = (e) => {
    if (dragMode === 'real' && history.current.length < 2) return;
    physics.current.isPlaying = false; setIsPlaying(false); physics.current.isScrubbing = true; document.body.style.cursor = 'ew-resize';
    const timeSpan = 4.0;
    if (dragMode === 'ideal') { physics.current.tyStartT = Math.max(0, physics.current.t - timeSpan * 0.75); } else { const latestT = history.current[history.current.length - 1].t; physics.current.tyStartT = Math.max(0, latestT - timeSpan); }
    handleTYPointerMove(e); 
  };

  const handleTYPointerMove = (e) => {
    if (!physics.current.isScrubbing) return;
    const canvas = tyGraphRef.current; const mouseX = getMouseX(e, canvas); const padding = 25; const tyW = canvas.width; const graphW = tyW - padding - 20; const timeSpan = 4.0;
    const startT = physics.current.tyStartT; let clampedX = Math.max(padding, Math.min(mouseX, padding + graphW)); let targetT = startT + ((clampedX - padding) / graphW) * timeSpan;
    if (dragMode === 'ideal') { physics.current.t = Math.max(0, targetT); physics.current.y = params.amplitude * Math.cos(omega * physics.current.t); physics.current.v = -params.amplitude * omega * Math.sin(omega * physics.current.t); physics.current.a = -params.amplitude * omega * omega * Math.cos(omega * physics.current.t); } else {
      const latestT = history.current.length > 1 ? history.current[history.current.length - 1].t : 0; targetT = Math.min(Math.max(targetT, history.current[0]?.t || 0), latestT);
      let closestPt = history.current[0]; let minDiff = Infinity;
      for (let i = 0; i < history.current.length; i++) { let diff = Math.abs(history.current[i].t - targetT); if (diff < minDiff) { minDiff = diff; closestPt = history.current[i]; } }
      if (closestPt) { physics.current.t = closestPt.t; physics.current.y = closestPt.y; physics.current.v = closestPt.v; physics.current.a = closestPt.a; }
    }
  };

  const handleTYPointerUp = () => { if (physics.current.isScrubbing) { physics.current.isScrubbing = false; document.body.style.cursor = 'default'; } };

  const handleXYPointerDown = (e) => {
    if (dragMode === 'real' && history.current.length < 2) return;
    const canvas = xyGraphRef.current; physics.current.isXYScrubbing = true; physics.current.isPlaying = false; setIsPlaying(false); physics.current.lastXYMouseX = getMouseX(e, canvas); document.body.style.cursor = 'grabbing';
  };

  const handleXYPointerMove = (e) => {
    if (!physics.current.isXYScrubbing) return;
    const canvas = xyGraphRef.current; const mouseX = getMouseX(e, canvas); const deltaX = mouseX - physics.current.lastXYMouseX; const pxPerMeter = 50;
    if (xyDragMode === 'space') { physics.current.xyOffset -= deltaX / pxPerMeter; if (physics.current.xyOffset < 0) physics.current.xyOffset = 0; } else {
      const deltaDist = deltaX / pxPerMeter; const deltaT = deltaDist / waveSpeed;
      if (dragMode === 'ideal') { physics.current.t = Math.max(0, physics.current.t + deltaT); physics.current.y = params.amplitude * Math.cos(omega * physics.current.t); physics.current.v = -params.amplitude * omega * Math.sin(omega * physics.current.t); physics.current.a = -params.amplitude * omega * omega * Math.cos(omega * physics.current.t); } else {
        const latestT = history.current.length > 0 ? history.current[history.current.length - 1].t : 0; let targetT = physics.current.t + deltaT; targetT = Math.min(Math.max(targetT, history.current[0]?.t || 0), latestT);
        let closestPt = history.current[0]; let minDiff = Infinity;
        for (let i = 0; i < history.current.length; i++) { let diff = Math.abs(history.current[i].t - targetT); if (diff < minDiff) { minDiff = diff; closestPt = history.current[i]; } }
        if (closestPt) { physics.current.t = closestPt.t; physics.current.y = closestPt.y; physics.current.v = closestPt.v; physics.current.a = closestPt.a; }
      }
    }
    physics.current.lastXYMouseX = mouseX;
  };

  const handleXYPointerUp = () => { if (physics.current.isXYScrubbing) { physics.current.isXYScrubbing = false; document.body.style.cursor = 'default'; } };

  const drawArrow = (ctx, fromX, fromY, toX, toY, color, width = 3) => { if (Math.abs(fromX - toX) < 1 && Math.abs(fromY - toY) < 1) return; const headlen = 10; const angle = Math.atan2(toY - fromY, toX - fromX); ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6)); ctx.moveTo(toX, toY); ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); };

  const animate = (time) => {
    if (!mainCanvasRef.current || !tyGraphRef.current || !xyGraphRef.current) { lastTimeRef.current = time; requestRef.current = requestAnimationFrame(animate); return; }
    if (lastTimeRef.current != null) {
      const delta = (time - lastTimeRef.current) / 1000; const dt = Math.min(delta, 0.05) * playbackSpeed; const state = physics.current;
      if (state.isPlaying && !state.isDragging && !state.isScrubbing && !state.isXYScrubbing) {
        if (dragMode === 'ideal') { state.t += dt; state.y = params.amplitude * Math.cos(omega * state.t); state.v = -params.amplitude * omega * Math.sin(omega * state.t); state.a = -params.amplitude * omega * omega * Math.cos(omega * state.t); } else {
          if (history.current.length > 0 && history.current[history.current.length - 1].t > state.t) { history.current = history.current.filter(p => p.t <= state.t); }
          const force = -params.k * state.y - params.damping * state.v; state.a = force / params.mass; state.v += state.a * dt; state.y += state.v * dt; state.t += dt;
          if (history.current.length === 0 || state.t - history.current[history.current.length - 1].t > 0.015) { history.current.push({ t: state.t, y: state.y, v: state.v, a: state.a }); if (history.current.length > 500) history.current.shift(); }
        }
      } else if (state.isDragging && dragMode === 'real') {
        state.t += dt; state.a = (-params.k * state.y) / params.mass; state.v = 0;
        if (history.current.length === 0 || state.t - history.current[history.current.length - 1].t > 0.015) { history.current.push({ t: state.t, y: state.y, v: state.v, a: state.a }); if (history.current.length > 500) history.current.shift(); }
      }

      const kE = 0.5 * params.mass * Math.pow(state.v, 2); const pE = 0.5 * params.k * Math.pow(state.y, 2); const totalE = kE + pE; const refAmp = dragMode === 'ideal' ? params.amplitude : 3.5; const maxERef = Math.max(totalE, 0.5 * params.k * Math.pow(refAmp, 2));
      if (uiRefs.y.current) uiRefs.y.current.textContent = state.y.toFixed(2); if (uiRefs.v.current) uiRefs.v.current.textContent = state.v.toFixed(2); if (uiRefs.a.current) uiRefs.a.current.textContent = state.a.toFixed(2); if (uiRefs.force.current) uiRefs.force.current.textContent = (-params.k * state.y).toFixed(1); if (uiRefs.kE.current) uiRefs.kE.current.textContent = kE.toFixed(1); if (uiRefs.pE.current) uiRefs.pE.current.textContent = pE.toFixed(1); if (uiRefs.totalE.current) uiRefs.totalE.current.textContent = totalE.toFixed(1); if (uiRefs.kEBar.current) uiRefs.kEBar.current.style.width = `${(kE / maxERef) * 100}%`; if (uiRefs.pEBar.current) uiRefs.pEBar.current.style.width = `${(pE / maxERef) * 100}%`;

      const mCtx = mainCanvasRef.current.getContext('2d'); const w = mainCanvasRef.current.width, h = mainCanvasRef.current.height; 
      
      if (mode === 'horizontal') {
        const eqX = w / 2, groundY = h - 30; mCtx.clearRect(0, 0, w, h); mCtx.fillStyle = '#0f172a'; mCtx.fillRect(0, 0, w, h);
        mCtx.beginPath(); mCtx.moveTo(0, groundY); mCtx.lineTo(w, groundY); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 3; mCtx.stroke(); mCtx.fillStyle = '#1e293b'; mCtx.fillRect(0, 0, 20, groundY); 
        mCtx.beginPath(); mCtx.setLineDash([5, 5]); mCtx.moveTo(eqX, 20); mCtx.lineTo(eqX, groundY + 20); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 2; mCtx.stroke(); 
        if (dragMode === 'ideal') { const A_px = params.amplitude * scale; mCtx.beginPath(); mCtx.moveTo(eqX - A_px, 20); mCtx.lineTo(eqX - A_px, groundY); mCtx.moveTo(eqX + A_px, 20); mCtx.lineTo(eqX + A_px, groundY); mCtx.strokeStyle = 'rgba(168, 85, 247, 0.3)'; mCtx.lineWidth = 1; mCtx.stroke(); mCtx.fillStyle = 'rgba(168, 85, 247, 0.8)'; mCtx.font = '10px sans-serif'; mCtx.fillText('-A', eqX - A_px - 15, groundY + 15); mCtx.fillText('+A', eqX + A_px + 5, groundY + 15); }
        mCtx.setLineDash([]); mCtx.fillStyle = '#64748b'; mCtx.font = '12px sans-serif'; mCtx.fillText('y = 0', eqX - 15, groundY + 20);
        const blockXCenter = eqX + state.y * scale; const bw = 60, bh = 40; const blockXLeft = blockXCenter - bw / 2; const spStartX = 20, spEndX = blockXLeft, spY = groundY - bh / 2; const coils = 20, spW = (spEndX - spStartX) / coils;
        mCtx.beginPath(); mCtx.moveTo(spStartX, spY); for (let i = 0; i < coils; i++) { mCtx.lineTo(spStartX + i * spW + spW * 0.25, spY - 12); mCtx.lineTo(spStartX + i * spW + spW * 0.75, spY + 12); mCtx.lineTo(spStartX + (i + 1) * spW, spY); }
        const forceColor = state.y > 0 ? `rgba(239, 68, 68, ${Math.min(1, state.y/2)})` : `rgba(59, 130, 246, ${Math.min(1, Math.abs(state.y)/2)})`; mCtx.strokeStyle = state.y === 0 ? '#475569' : forceColor; mCtx.lineWidth = 3; mCtx.stroke();
        const isAnyActive = state.isDragging || state.isScrubbing || state.isXYScrubbing; mCtx.fillStyle = isAnyActive ? (dragMode === 'ideal' ? '#a855f7' : '#f59e0b') : (!state.isPlaying ? '#475569' : '#3b82f6'); mCtx.shadowColor = 'rgba(0,0,0,0.4)'; mCtx.shadowBlur = 10; mCtx.shadowOffsetY = 4; mCtx.fillRect(blockXLeft, groundY - bh, bw, bh); mCtx.shadowColor = 'transparent';
        if (isAnyActive) { mCtx.fillStyle = '#cbd5e1'; mCtx.font = '12px sans-serif'; mCtx.fillText(`y: ${state.y.toFixed(2)}m`, blockXCenter - 40, groundY - bh - 35); } else { if (Math.abs(state.v) > 0.05) drawArrow(mCtx, blockXCenter, groundY - bh - 15, blockXCenter + state.v * 30, groundY - bh - 15, '#10b981'); if (Math.abs(state.a) > 0.1) drawArrow(mCtx, blockXCenter, groundY - bh - 30, blockXCenter + state.a * 5, groundY - bh - 30, '#ef4444'); }
      } else {
        const centerX = w / 2; const eqY = h / 2; const ceilingY = 25; 
        mCtx.clearRect(0, 0, w, h); mCtx.fillStyle = '#0f172a'; mCtx.fillRect(0, 0, w, h);
        mCtx.fillStyle = '#1e293b'; mCtx.fillRect(0, 0, w, ceilingY); mCtx.beginPath(); mCtx.moveTo(0, ceilingY); mCtx.lineTo(w, ceilingY); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 3; mCtx.stroke(); 
        mCtx.beginPath(); mCtx.setLineDash([5, 5]); mCtx.moveTo(20, eqY); mCtx.lineTo(w - 20, eqY); mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 2; mCtx.stroke(); mCtx.setLineDash([]); mCtx.fillStyle = '#64748b'; mCtx.font = '12px sans-serif'; mCtx.fillText('平衡位置 y = 0', 25, eqY - 10);
        if (dragMode === 'ideal') { const A_px = params.amplitude * scale; mCtx.beginPath(); mCtx.moveTo(20, eqY - A_px); mCtx.lineTo(w - 20, eqY - A_px); mCtx.moveTo(20, eqY + A_px); mCtx.lineTo(w - 20, eqY + A_px); mCtx.strokeStyle = 'rgba(168, 85, 247, 0.3)'; mCtx.lineWidth = 1; mCtx.stroke(); mCtx.fillStyle = 'rgba(168, 85, 247, 0.8)'; mCtx.font = '10px sans-serif'; mCtx.fillText('+A (波峰)', 25, eqY - A_px - 5); mCtx.fillText('-A (波谷)', 25, eqY + A_px + 12); }
        const blockYCenter = eqY - state.y * scale; const bw = 60, bh = 40; const blockLeft = centerX - bw / 2; const blockTop = blockYCenter - bh / 2;
        const spStartX = centerX, spStartY = ceilingY, spEndY = blockTop; const coils = 25, spH = (spEndY - spStartY) / coils; mCtx.beginPath(); mCtx.moveTo(spStartX, spStartY); for (let i = 0; i < coils; i++) { mCtx.lineTo(spStartX - 18, spStartY + i * spH + spH * 0.25); mCtx.lineTo(spStartX + 18, spStartY + i * spH + spH * 0.75); mCtx.lineTo(spStartX, spStartY + (i + 1) * spH); }
        const forceColor = state.y < 0 ? `rgba(239, 68, 68, ${Math.min(1, Math.abs(state.y)/2)})` : `rgba(59, 130, 246, ${Math.min(1, state.y/2)})`; mCtx.strokeStyle = state.y === 0 ? '#475569' : forceColor; mCtx.lineWidth = 3; mCtx.stroke();
        const isAnyActive = state.isDragging || state.isScrubbing || state.isXYScrubbing; mCtx.fillStyle = isAnyActive ? (dragMode === 'ideal' ? '#a855f7' : '#f59e0b') : (!state.isPlaying ? '#475569' : '#3b82f6'); mCtx.shadowColor = 'rgba(0,0,0,0.4)'; mCtx.shadowBlur = 10; mCtx.shadowOffsetY = 4; mCtx.fillRect(blockLeft, blockTop, bw, bh); mCtx.fillStyle = '#1e293b'; mCtx.fillRect(centerX - 5, blockTop - 5, 10, 5); mCtx.shadowColor = 'transparent';
        if (isAnyActive) { mCtx.fillStyle = '#cbd5e1'; mCtx.font = '12px sans-serif'; mCtx.fillText(`y: ${state.y.toFixed(2)}m`, blockLeft + bw + 10, blockYCenter + 4); } else { if (Math.abs(state.v) > 0.05) drawArrow(mCtx, centerX + bw/2 + 15, blockYCenter, centerX + bw/2 + 15, blockYCenter - state.v * 20, '#10b981'); if (Math.abs(state.a) > 0.1) drawArrow(mCtx, centerX + bw/2 + 30, blockYCenter, centerX + bw/2 + 30, blockYCenter - state.a * 3, '#ef4444'); }
      }

      const tyCtx = tyGraphRef.current.getContext('2d'); const tyW = tyGraphRef.current.width, tyH = tyGraphRef.current.height; tyCtx.clearRect(0, 0, tyW, tyH); const padding = 25; const tyOriginY = tyH / 2;
      tyCtx.beginPath(); tyCtx.moveTo(padding, tyOriginY); tyCtx.lineTo(tyW - 10, tyOriginY); tyCtx.moveTo(padding, 10); tyCtx.lineTo(padding, tyH - 10); tyCtx.strokeStyle = '#334155'; tyCtx.lineWidth = 1; tyCtx.stroke(); tyCtx.fillStyle = '#64748b'; tyCtx.font = '12px sans-serif'; tyCtx.fillText('时间 T', tyW - 40, tyOriginY + 15); tyCtx.fillText('位移 Y', padding - 20, 15);
      const timeSpan = 4.0; let startT;
      if (dragMode === 'ideal') {
        startT = state.isScrubbing ? state.tyStartT : Math.max(0, state.t - timeSpan * 0.75); 
        tyCtx.beginPath(); for (let px = padding; px <= tyW - 10; px++) { let t_point = startT + ((px - padding) / (tyW - padding - 20)) * timeSpan; if (t_point < 0) continue; let y_point = params.amplitude * Math.cos(omega * t_point); let py = tyOriginY - y_point * (tyH / 8); if (px === padding) tyCtx.moveTo(px, py); else tyCtx.lineTo(px, py); } tyCtx.strokeStyle = 'rgba(168, 85, 247, 0.4)'; tyCtx.lineWidth = 3; tyCtx.stroke();
        tyCtx.beginPath(); for (let px = padding; px <= tyW - 10; px++) { let t_point = startT + ((px - padding) / (tyW - padding - 20)) * timeSpan; if (t_point < 0 || t_point > state.t) continue; let y_point = params.amplitude * Math.cos(omega * t_point); let py = tyOriginY - y_point * (tyH / 8); if (px === padding || t_point === 0) tyCtx.moveTo(px, py); else tyCtx.lineTo(px, py); } tyCtx.strokeStyle = '#9333ea'; tyCtx.lineWidth = 2.5; tyCtx.stroke();
      } else {
        if (history.current.length > 1) {
          if (state.isScrubbing) { startT = state.tyStartT; } else { const latestT = history.current[history.current.length - 1].t; startT = Math.max(0, latestT - timeSpan); }
          tyCtx.beginPath(); for (let i = 0; i < history.current.length; i++) { const pt = history.current[i]; if (pt.t < startT) continue; const px = padding + ((pt.t - startT) / timeSpan) * (tyW - padding - 20); const py = tyOriginY - pt.y * (tyH / 8); if (i === 0 || history.current[i-1].t < startT) tyCtx.moveTo(px, py); else tyCtx.lineTo(px, py); } tyCtx.strokeStyle = '#3b82f6'; tyCtx.lineWidth = 2.5; tyCtx.stroke();
        }
      }
      startT = startT || 0; const playheadX = padding + ((state.t - startT) / timeSpan) * (tyW - padding - 20);
      if (playheadX >= padding && playheadX <= tyW - 10) { tyCtx.beginPath(); tyCtx.moveTo(playheadX, 10); tyCtx.lineTo(playheadX, tyH - 10); tyCtx.strokeStyle = dragMode === 'ideal' ? '#a855f7' : '#f59e0b'; tyCtx.lineWidth = 2; tyCtx.setLineDash([4, 4]); tyCtx.stroke(); tyCtx.setLineDash([]); const playheadY = tyOriginY - state.y * (tyH / 8); tyCtx.beginPath(); tyCtx.arc(playheadX, playheadY, 5, 0, Math.PI * 2); tyCtx.fillStyle = dragMode === 'ideal' ? '#a855f7' : '#f59e0b'; tyCtx.fill(); tyCtx.strokeStyle = '#fff'; tyCtx.lineWidth = 1.5; tyCtx.stroke(); if(mode==='vertical'){ tyCtx.beginPath(); tyCtx.moveTo(0, playheadY); tyCtx.lineTo(playheadX, playheadY); tyCtx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; tyCtx.setLineDash([2, 2]); tyCtx.stroke(); tyCtx.setLineDash([]); } }

      const xyCtx = xyGraphRef.current.getContext('2d'); const xyW = xyGraphRef.current.width, xyH = xyGraphRef.current.height; xyCtx.clearRect(0, 0, xyW, xyH); const xyOriginY = xyH / 2;
      xyCtx.beginPath(); xyCtx.moveTo(padding, xyOriginY); xyCtx.lineTo(xyW - 10, xyOriginY); xyCtx.moveTo(padding, 10); xyCtx.lineTo(padding, xyH - 10); xyCtx.strokeStyle = '#334155'; xyCtx.lineWidth = 1; xyCtx.stroke(); xyCtx.fillStyle = '#64748b'; xyCtx.font = '12px sans-serif'; xyCtx.fillText('位置 X', xyW - 40, xyOriginY + 15); xyCtx.fillText('位移 Y', padding - 20, 15);
      const pxPerMeter = 50; const currentXOffset = state.xyOffset || 0; xyCtx.fillStyle = '#475569'; xyCtx.font = '10px sans-serif'; xyCtx.fillText(`${currentXOffset.toFixed(1)}m`, padding + 5, xyOriginY + 25); const endMeter = currentXOffset + (xyW - padding - 10) / pxPerMeter; xyCtx.fillText(`${endMeter.toFixed(1)}m`, xyW - 35, xyOriginY + 25);
      xyCtx.beginPath();
      if (dragMode === 'ideal') {
        for (let px = padding; px <= xyW - 10; px++) { const dist = (px - padding) / pxPerMeter + currentXOffset; const emissionTime = state.t - dist / waveSpeed; let dispY = emissionTime >= 0 ? params.amplitude * Math.cos(omega * emissionTime) : params.amplitude * Math.cos(0); const py = xyOriginY - dispY * (xyH / 8); if (px === padding) xyCtx.moveTo(px, py); else xyCtx.lineTo(px, py); } xyCtx.strokeStyle = '#9333ea'; xyCtx.lineWidth = 2.5; xyCtx.stroke();
      } else {
        if (history.current.length > 1) { for (let px = padding; px < xyW - 10; px++) { const dist = (px - padding) / pxPerMeter + currentXOffset; const emissionTime = state.t - dist / waveSpeed; let dispY = 0; if (emissionTime >= history.current[0].t) { let idx = history.current.findIndex(p => p.t >= emissionTime); if (idx > 0) { const p1 = history.current[idx - 1]; const p2 = history.current[idx]; const fraction = (emissionTime - p1.t) / (p2.t - p1.t); dispY = p1.y + fraction * (p2.y - p1.y); } else if (idx === 0) { dispY = history.current[0].y; } } const py = xyOriginY - dispY * (xyH / 8); if (px === padding) xyCtx.moveTo(px, py); else xyCtx.lineTo(px, py); } xyCtx.strokeStyle = '#8b5cf6'; xyCtx.lineWidth = 2.5; xyCtx.stroke(); }
      }
      const sourcePx = padding - currentXOffset * pxPerMeter;
      if (sourcePx >= padding - 5 && sourcePx <= xyW) { const pySource = xyOriginY - state.y * (xyH / 8); xyCtx.beginPath(); xyCtx.moveTo(sourcePx, 10); xyCtx.lineTo(sourcePx, xyH - 10); xyCtx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; xyCtx.lineWidth = 2; xyCtx.setLineDash([4, 4]); xyCtx.stroke(); xyCtx.setLineDash([]); xyCtx.beginPath(); xyCtx.arc(sourcePx, pySource, 5, 0, Math.PI * 2); xyCtx.fillStyle = dragMode === 'ideal' ? '#a855f7' : '#f59e0b'; xyCtx.fill(); xyCtx.strokeStyle = '#fff'; xyCtx.lineWidth = 1.5; xyCtx.stroke(); if(mode==='vertical'){ xyCtx.beginPath(); xyCtx.moveTo(0, pySource); xyCtx.lineTo(sourcePx, pySource); xyCtx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; xyCtx.setLineDash([2, 2]); xyCtx.stroke(); xyCtx.setLineDash([]); } }
    }
    lastTimeRef.current = time; requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => { requestRef.current = requestAnimationFrame(animate); return () => cancelAnimationFrame(requestRef.current); }, [params, playbackSpeed, dragMode]);

  return (
    <div className="space-y-4">
      <header className="bg-slate-800 rounded-xl p-4 flex flex-wrap justify-between items-center shadow-lg border border-slate-700 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">🧲 沉浸式弹簧振子：全维三项动态绑定</h1>
          <p className="text-emerald-400 font-medium text-sm mt-1">✨ {mode === 'horizontal' ? '已升级三项同步：拖动物块 / T-Y图时间轴 / X-Y图波形 中的任意一项，另外两项将毫秒级同步！' : '全新改版：竖直摆放完美对应波动图象的Y轴位移。上下拖动体验最强关联感！'}</p>
        </div>
        <div className="flex space-x-6 text-sm bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
          <div className="text-center"><span className="block text-slate-500 text-xs">角频率 ω</span><span className="font-mono text-blue-400 text-lg font-bold">{omega.toFixed(2)}</span></div>
          <div className="text-center"><span className="block text-slate-500 text-xs">周期 T</span><span className="font-mono text-blue-400 text-lg font-bold">{period}s</span></div>
        </div>
      </header>

      <div className="bg-slate-800 rounded-xl px-5 py-3 border border-slate-700 flex flex-col lg:flex-row justify-between items-center shadow-lg gap-4">
        <div className="flex items-center gap-3 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
          <button onClick={() => {setDragMode('ideal'); resetSystem();}} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dragMode === 'ideal' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>🔮 正规函数</button>
          <button onClick={() => {setDragMode('real'); resetSystem();}} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dragMode === 'real' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'}`}>🖐️ 真实记录</button>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-slate-400 font-bold">倍速:</span>
            <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))} className="bg-slate-700 text-slate-200 border border-slate-600 rounded-lg px-2 py-1.5 outline-none text-xs font-bold transition-colors">
              <option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1.0}>1.0x</option><option value={2.0}>2.0x</option>
            </select>
          </div>
          <button onClick={togglePlay} className={`px-4 py-2 rounded-lg text-sm font-bold ${isPlaying ? 'bg-amber-500 text-slate-900' : 'bg-emerald-500 text-white'}`}>{isPlaying ? "⏸️ 暂停" : "▶️ 播放"}</button>
          <button onClick={resetSystem} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold">🔄 重置</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={mode === 'horizontal' ? "lg:col-span-9 flex flex-col gap-4" : "lg:col-span-3 flex flex-col gap-4"}>
          <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 overflow-hidden relative group flex-1">
            <canvas ref={mainCanvasRef} width={mode === 'horizontal' ? 900 : 280} height={mode === 'horizontal' ? 260 : 460} className="w-full h-full block cursor-grab active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}/>
          </div>
        </div>

        <div className={mode === 'horizontal' ? "lg:col-span-9 flex flex-col md:flex-row gap-4 flex-1" : "lg:col-span-6 flex flex-col gap-4"}>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col relative group flex-1">
            <h3 className="text-sm font-bold text-slate-200 mb-2 flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500"></div> 振动图像 (T-Y图)</h3>
            <div className="flex-1 w-full bg-slate-900 rounded-lg border border-slate-800 p-2 relative overflow-hidden min-h-[160px]">
              <canvas ref={tyGraphRef} width={400} height={180} className="w-full h-full cursor-ew-resize relative z-10" onPointerDown={handleTYPointerDown} onPointerMove={handleTYPointerMove} onPointerUp={handleTYPointerUp} onPointerLeave={handleTYPointerUp}/>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col relative group flex-1">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-500"></div> 波动图像 (X-Y图)</h3>
              <div className="flex bg-slate-900 rounded p-1 border border-slate-700 text-[10px]">
                <button onClick={() => setXyDragMode('time')} className={`px-2 py-1 rounded transition-colors ${xyDragMode === 'time' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}>拖波形(调时)</button>
                <button onClick={() => setXyDragMode('space')} className={`px-2 py-1 rounded transition-colors ${xyDragMode === 'space' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>平移轴(空间)</button>
              </div>
            </div>
            <div className="flex-1 w-full bg-slate-900 rounded-lg border border-slate-800 p-2 relative overflow-hidden min-h-[160px]">
              <canvas ref={xyGraphRef} width={400} height={180} className="w-full h-full cursor-ew-resize relative z-10" onPointerDown={handleXYPointerDown} onPointerMove={handleXYPointerMove} onPointerUp={handleXYPointerUp} onPointerLeave={handleXYPointerUp}/>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">系统参数</h3>
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-xs text-slate-400 mb-1"><span>固定最大振幅 (A)</span> <span>{params.amplitude.toFixed(1)} m</span></label>
                <input type="range" min="1.0" max="3.8" step="0.1" value={params.amplitude} onChange={e => setParams({...params, amplitude: parseFloat(e.target.value)})} className="w-full accent-purple-500" disabled={dragMode !== 'ideal'} />
              </div>
              <div>
                <label className="flex justify-between text-xs text-slate-400 mb-1"><span>劲度系数 (k)</span> <span>{params.k} N/m</span></label>
                <input type="range" min="10" max="100" step="1" value={params.k} onChange={e => setParams({...params, k: parseFloat(e.target.value)})} className="w-full accent-blue-500" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="font-semibold text-slate-200 mb-4 border-b border-slate-700 pb-2">实时能量</h3>
            <div className="space-y-4 font-mono text-sm">
              <div><div className="h-2 bg-slate-900 rounded-full overflow-hidden"><div ref={uiRefs.kEBar} className="h-full bg-emerald-500 transition-none"></div></div></div>
              <div><div className="h-2 bg-slate-900 rounded-full overflow-hidden"><div ref={uiRefs.pEBar} className="h-full bg-blue-500 transition-none"></div></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 核心外壳：导航与标签页管理
// ==========================================
const LabApp = () => {
  const [activeTab, setActiveTab] = useState('pendulum');
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl">
            <div>
                <h1 className="text-3xl font-black text-white">超感物理模拟实验室 <span className="text-blue-500 text-lg">v2.0</span></h1>
                <p className="text-slate-500 text-xs mt-1 font-bold">高精度物理引擎 · 实时能量观测 · 全感官联动交互</p>
            </div>
            <nav className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                <button onClick={() => setActiveTab('pendulum')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab==='pendulum'?'bg-blue-600 text-white shadow-lg':'text-slate-500'}`}>单摆探究</button>
                <button onClick={() => setActiveTab('hSpring')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab==='hSpring'?'bg-purple-600 text-white shadow-lg':'text-slate-500'}`}>横向弹簧</button>
                <button onClick={() => setActiveTab('vSpring')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab==='vSpring'?'bg-emerald-600 text-white shadow-lg':'text-slate-500'}`}>竖向弹簧</button>
            </nav>
        </header>
        <main>
            {activeTab === 'pendulum' && <PendulumSim />}
            {activeTab === 'hSpring' && <SpringSim mode="horizontal" />}
            {activeTab === 'vSpring' && <SpringSim mode="vertical" />}
        </main>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<LabApp />);A
