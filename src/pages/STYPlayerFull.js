import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// ──────────────────────────────────────────────────────────────────────────────
// Simple, dependency-free rotary knob (SVG)
// - Drag vertically or use mouse wheel to change value
// - Keyboard: ArrowUp/Down (±step), PageUp/PageDown (±5*step), Home/End (min/max)
// ──────────────────────────────────────────────────────────────────────────────
function Knob({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  caption,
}) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270; // from -135° to +135°
  const knobRef = useRef(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);

  const setFromDelta = (dy) => {
    // vertical drag: 100px => full range
    const range = max - min;
    const delta = -(dy / 100) * range; // invert (up increases)
    const raw = startVal.current + delta;
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped));
  };

  const onMouseDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp, { once: true });
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    setFromDelta(dy);
  };
  const onMouseUp = () => {
    dragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const next = clamp(value + direction * step);
    onChange(next);
  };

  const onKeyDown = (e) => {
    let next = value;
    if (e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowDown') next = value - step;
    else if (e.key === 'PageUp') next = value + 5 * step;
    else if (e.key === 'PageDown') next = value - 5 * step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next !== value) {
      e.preventDefault();
      onChange(clamp(next));
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        ref={knobRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        className="w-28 h-28 rounded-full bg-[#2b2b2b] shadow-inner border border-black/30 relative grid place-items-center cursor-grab active:cursor-grabbing"
      >
        {/* Dial */}
        <svg width="84" height="84" viewBox="0 0 84 84" className="drop-shadow">
          <defs>
            <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#3d3d3d" />
              <stop offset="100%" stopColor="#1f1f1f" />
            </linearGradient>
          </defs>
          <circle cx="42" cy="42" r="36" fill="url(#g)" stroke="#111" strokeWidth="2" />
          {/* Ticks */}
          {[...Array(11)].map((_, i) => {
            const a = (-135 + (270 * i) / 10) * (Math.PI / 180);
            const x1 = 42 + Math.cos(a) * 28;
            const y1 = 42 + Math.sin(a) * 28;
            const x2 = 42 + Math.cos(a) * 34;
            const y2 = 42 + Math.sin(a) * 34;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth="2" />;
          })}
          {/* Needle */}
          <g transform={`rotate(${angle} 42 42)`}>
            <line x1="42" y1="42" x2="42" y2="14" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <circle cx="42" cy="42" r="5" fill="#0f0f0f" stroke="#f59e0b" />
          </g>
        </svg>
        <div className="absolute bottom-1 text-xs text-gray-300">{Math.round(value)}</div>
      </div>
      <div className="text-sm font-semibold tracking-wide">{label}</div>
      {caption && <div className="text-xs text-gray-400">{caption}</div>}
    </div>
  );
}

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [sectionsAvailability, setSectionsAvailability] = useState({}); // { "Main A":1, "Intro B":1, ... }
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState({
    acmp: false,
    autofill: false,
    intro: '',
    main: 'A',
    ending: '',
    play: false,
  });
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // NEW: Master volume (0..1 -> UI shows 0..100) & Tempo (BPM)
  const [volume, setVolume] = useState(80); // percent
  const [tempo, setTempo] = useState(120);
  const baseTempoRef = useRef(120); // BPM used to compute playbackRate

  // deux audio elements : mainAudio pour loop, oneShotAudio pour Fill/Intro/Ending
  const mainAudioRef = useRef(null);
  const oneShotAudioRef = useRef(null);

  const playTimerRef = useRef(null);
  const blinkStepIndex = useRef(0);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;

  const blinkSequence = [
    { color: 'blue', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
    { color: 'orange', duration: 100 },
    { color: null, duration: 500 },
  ];

  // Utility : construit l'URL dans Supabase (format exact demandé)
  const getSupabaseWavUrl = (beatId, sectionName) => {
    const filename = `${beatId}_${sectionName.replace(/ /g, '_')}.wav`;
    return `https://swtbkiudmfvnywcgpzfe.supabase.co/storage/v1/object/public/midiAndWav/${beatId}/${filename}`;
  };

  // Playback side-effects: apply volume & tempo
  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume / 100));
    if (mainAudioRef.current) mainAudioRef.current.volume = v;
    if (oneShotAudioRef.current) oneShotAudioRef.current.volume = v;
  }, [volume]);

  useEffect(() => {
    const base = baseTempoRef.current || 120;
    const rate = Math.max(0.25, Math.min(4, tempo / base));
    if (mainAudioRef.current) mainAudioRef.current.playbackRate = rate;
    if (oneShotAudioRef.current) oneShotAudioRef.current.playbackRate = rate;
  }, [tempo]);

  // indicateur clignotant lorsque lecture active
  useEffect(() => {
    if (controls.play) {
      blinkStepIndex.current = 0;
      const runBlink = () => {
        const step = blinkSequence[blinkStepIndex.current];
        setPlayColor(step.color);
        playTimerRef.current = setTimeout(() => {
          blinkStepIndex.current = (blinkStepIndex.current + 1) % blinkSequence.length;
          runBlink();
        }, step.duration);
      };
      runBlink();
    } else {
      clearTimeout(playTimerRef.current);
      setPlayColor(null);
    }
    return () => clearTimeout(playTimerRef.current);
  }, [controls.play]);

  // charger la liste de beats
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }
    axios
      .get('/api/beats', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
        mainAudioRef.current.src = '';
      }
      if (oneShotAudioRef.current) {
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.src = '';
      }
      clearTimeout(playTimerRef.current);
    };
  }, []);

  // --- SELECT BEAT --- (reset + récupérer sections via /prepare-all)
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);

    // reset controls & audio
    setControls({ acmp: false, autofill: false, intro: '', main: 'A', ending: '', play: false });
    setMainBlinking(null);
    setPlayColor(null);
    clearTimeout(playTimerRef.current);

    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      mainAudioRef.current.currentTime = 0;
      mainAudioRef.current.removeAttribute('src');
      mainAudioRef.current.load();
    }
    if (oneShotAudioRef.current) {
      oneShotAudioRef.current.pause();
      oneShotAudioRef.current.currentTime = 0;
      oneShotAudioRef.current.removeAttribute('src');
      oneShotAudioRef.current.load();
    }

    setSectionsAvailability({});

    // NEW: set base tempo/tempo from beat if available
    const newBase = beat?.tempo || 120;
    baseTempoRef.current = newBase;
    setTempo(newBase);

    try {
      const token = localStorage.getItem('token');
      const prepareAllResp = await axios.post(
        '/api/player/prepare-all',
        { beatId: beat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (prepareAllResp.data.sections) {
        setSectionsAvailability(prepareAllResp.data.sections);
        console.log('Sections détectées:', prepareAllResp.data.sections);
      } else {
        setSectionsAvailability({});
        console.warn('Aucune section détectée par prepare-all');
      }
    } catch (err) {
      console.error('❌ Préparation du beat échouée :', err);
      alert('❌ Échec de la préparation du beat');
      setSectionsAvailability({});
    } finally {
      setIsLoading(false);
    }
  };

  // --- Play a specific section ---
  const playSection = async (sectionName) => {
    if (!selectedBeat) return;
    if (!sectionsAvailability || sectionsAvailability[sectionName] !== 1) {
      console.warn('Section non disponible:', sectionName);
      return;
    }

    const beatId = selectedBeat.id;
    const url = getSupabaseWavUrl(beatId, sectionName);

    // If it's a Main -> loop on mainAudio
    if (/^Main\s[ABCD]$/i.test(sectionName)) {
      if (oneShotAudioRef.current && !oneShotAudioRef.current.paused) {
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.currentTime = 0;
      }

      const mainEl = mainAudioRef.current;
      if (!mainEl) return;
      mainEl.src = url;
      mainEl.loop = true;
      mainEl.preload = 'auto';
      try {
        await mainEl.play();
        setControls((prev) => ({ ...prev, play: true }));
      } catch (err) {
        console.error('Impossible de jouer le main:', err);
        throw err;
      }
      const m = sectionName.split(' ')[1];
      setControls((prev) => ({ ...prev, main: m }));
      setMainBlinking(m);
      setTimeout(() => setMainBlinking(null), 2000);
      return;
    }

    // One-shot (Intro / Ending / Fill In)
    const oneEl = oneShotAudioRef.current;
    if (!oneEl) return;

    const mainEl = mainAudioRef.current;
    const wasMainPlaying = mainEl && !mainEl.paused && mainEl.currentSrc;

    if (wasMainPlaying) {
      try { mainEl.pause(); } catch (e) { console.warn('pause main failed', e); }
    }

    oneEl.src = url;
    oneEl.loop = false;
    oneEl.preload = 'auto';

    try {
      await oneEl.play();
      setControls((prev) => ({ ...prev, play: true }));
    } catch (err) {
      console.error('Impossible de jouer one-shot:', err);
      if (wasMainPlaying && mainEl) mainEl.play().catch(() => {});
      return;
    }

    const onEnded = async () => {
      oneEl.removeEventListener('ended', onEnded);

      if (/^Intro\s[ABCD]$/i.test(sectionName) || /^Ending\s[ABCD]$/i.test(sectionName)) {
        const mainLetter = controls.main || 'A';
        const mainUrl = getSupabaseWavUrl(beatId, `Main ${mainLetter}`);
        mainEl.src = mainUrl;
        mainEl.loop = true;
        mainEl.preload = 'auto';
        mainEl.currentTime = 0;
        try {
          await mainEl.play();
          setControls((prev) => ({ ...prev, play: true }));
        } catch (e) {
          console.error('unable to resume main after intro/ending', e);
          setControls((prev) => ({ ...prev, play: false }));
        }
        return;
      }

      const fillMatch = sectionName.match(/^Fill In\s([A-D])\1$/i);
      if (fillMatch) {
        const newMain = fillMatch[1].toUpperCase();
        const newMainUrl = getSupabaseWavUrl(beatId, `Main ${newMain}`);
        mainEl.src = newMainUrl;
        mainEl.loop = true;
        mainEl.preload = 'auto';
        mainEl.currentTime = 0;
        try {
          await mainEl.play();
          setControls((prev) => ({ ...prev, main: newMain, play: true }));
          setMainBlinking(newMain);
          setTimeout(() => setMainBlinking(null), 2000);
        } catch (e) {
          console.error('Impossible de démarrer le nouveau main après fill', e);
        }
        return;
      }

      if (mainEl) {
        try {
          await mainEl.play();
          setControls((prev) => ({ ...prev, play: true }));
        } catch (e) {
          setControls((prev) => ({ ...prev, play: false }));
        }
      }
    };

    oneEl.addEventListener('ended', onEnded);
  };

  // toggle play
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    if (controls.play) {
      if (oneShotAudioRef.current && !oneShotAudioRef.current.paused) {
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.currentTime = 0;
      }
      if (mainAudioRef.current && !mainAudioRef.current.paused) {
        mainAudioRef.current.pause();
        mainAudioRef.current.currentTime = 0;
      }
      setControls((prev) => ({ ...prev, play: false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    let sectionToPlay = null;
    if (controls.intro) sectionToPlay = `Intro ${controls.intro}`;
    else if (controls.main) sectionToPlay = `Main ${controls.main}`;
    else if (controls.ending) sectionToPlay = `Ending ${controls.ending}`;

    if (!sectionToPlay) {
      console.warn('Aucune section active pour démarrer la lecture.');
      return;
    }
    if (!sectionsAvailability[sectionToPlay]) {
      const fallback = Object.keys(sectionsAvailability).find((k) => /^Main\s[ABCD]$/i.test(k) && sectionsAvailability[k] === 1);
      if (fallback) sectionToPlay = fallback; else { alert('Aucune section disponible à jouer.'); return; }
    }

    try {
      await playSection(sectionToPlay);
    } catch (err) {
      console.error('Erreur pendant playSection:', err);
      alert('Impossible de démarrer la lecture.');
      setControls((prev) => ({ ...prev, play: false }));
    }
  };

  const handleControlClick = (type, value = null) => {
    if (!type) return;
    const letter = value ? String(value).toUpperCase() : '';

    if (!controls.play) {
      if (type === 'main') {
        setControls((prev) => ({ ...prev, main: letter }));
        setMainBlinking(letter);
        setTimeout(() => setMainBlinking(null), 1200);
        return;
      }
      if (type === 'intro') { setControls((prev) => ({ ...prev, intro: letter, ending: '' })); return; }
      if (type === 'ending') { setControls((prev) => ({ ...prev, ending: letter, intro: '' })); return; }
      if (type === 'acmp' || type === 'autofill') { setControls((prev) => ({ ...prev, [type]: !prev[type] })); return; }
      if (type === 'play') { togglePlay(); return; }
      return;
    }

    if (type === 'main') {
      const targetMain = letter;
      if (controls.main === targetMain) return;
      const fillName = `Fill In ${targetMain}${targetMain}`;
      if (sectionsAvailability[fillName] === 1) {
        playSection(fillName);
      } else {
        playSection(`Main ${targetMain}`);
      }
      setControls((prev) => ({ ...prev, main: targetMain }));
      setMainBlinking(targetMain);
      setTimeout(() => setMainBlinking(null), 1500);
      return;
    }

    if (type === 'intro' || type === 'ending') {
      const sectionName = `${type.charAt(0).toUpperCase() + type.slice(1)} ${letter}`;
      if (sectionsAvailability[sectionName] !== 1) return;
      playSection(sectionName);
      setControls((prev) =>
        type === 'intro' ? { ...prev, intro: letter, ending: '' } : { ...prev, ending: letter, intro: '' }
      );
      return;
    }

    if (type === 'acmp' || type === 'autofill') { setControls((prev) => ({ ...prev, [type]: !prev[type] })); return; }
    if (type === 'play') { togglePlay(); return; }
  };

  // pagination helpers
  const currentPageBeats = beats.slice(page * 10, (page + 1) * 10);
  const leftColumn = currentPageBeats.slice(0, 5);
  const rightColumn = currentPageBeats.slice(5);

  const renderBeatCard = (beat) => (
    <div
      key={beat.id}
      onClick={() => handleSelectBeat(beat)}
      className={`flex items-center gap-3 cursor-pointer p-2 mb-2 rounded-md transition hover:bg-blue-700 ${
        selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'
      }`}
      style={{ height: '1cm', minHeight: '1cm' }}
    >
      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
        <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
      </div>
      <div style={{ fontSize: '0.8rem', lineHeight: '1rem' }}>
        <p className="font-semibold">{beat.title}</p>
        {beat.user?.username && (
          <p className="text-sm text-gray-400">
            {beat.signature} - {beat.tempo} BPM - Auteur : {beat.user.username}
          </p>
        )}
      </div>
    </div>
  );

  const getIconPath = (title) => {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  };

  const renderButton = (type, label, isActive, onClick, isBlinking = false, disabled = false) => {
    let colorClass = 'bg-transparent';
    if (type === 'acmp' || type === 'autofill') colorClass = isActive ? 'bg-orange-400 glow' : 'bg-black';
    else if (type === 'main') colorClass = isBlinking ? 'animate-orange-blue-blink' : isActive ? 'bg-blue-500 glow' : 'bg-orange-400';
    else colorClass = isActive ? 'bg-orange-400 glow' : 'bg-transparent';
    if (disabled) colorClass = 'bg-black';

    return (
      <div
        onClick={disabled ? undefined : onClick}
        className={`flex flex-col items-center select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <div className={`w-8 h-2 mb-1 rounded-sm transition-all duration-300 ${colorClass}`} />
        <button
          className="text-white bg-[#333] w-16 h-[60px] rounded-md font-bold"
          style={{ fontSize: type === 'main' ? '1.2rem' : '0.65rem' }}
          disabled={(isLoading && type === 'play') || disabled}
        >
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      {/* Deux balises audio cachées */}
      <audio ref={mainAudioRef} hidden />
      <audio ref={oneShotAudioRef} hidden />
      <h1 className="text-3xl font-bold text-center mb-4">🎧 PSR MANAGER STYLE</h1>

      {/* ─────────────────────────────────────────────────────────────
         RÉPÉTEUR (écran des styles) avec KNOBS aux extrémités
         - Knob VOLUME (gauche) fixe (≈160px)
         - Zone centrale un peu plus large (grandit légèrement)
         - Knob TEMPO (droite) fixe (≈160px)
         - Sur petits écrans, empilement vertical
         ───────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-stretch md:justify-between gap-4 mb-6">
        {/* LEFT: VOLUME knob (compact, fixé) */}
        <div className="md:w-[160px] w-full bg-[#2a2a2a] rounded-xl p-4 grid place-items-center">
          <Knob
            label="VOLUME"
            min={0}
            max={100}
            step={1}
            value={volume}
            caption={`${Math.round(volume)}%`}
            onChange={setVolume}
          />
        </div>

        {/* CENTER: Liste des beats — légèrement plus large, sans être énorme */}
        <div
          className="
            flex-1
            md:basis-[720px]
            md:max-w-[calc(100%-320px-1rem)]
            grid grid-cols-1 lg:grid-cols-2 gap-4
          "
        >
          <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
            {leftColumn.length === 0
              ? <p className="text-gray-400 text-center">Aucun beat disponible</p>
              : leftColumn.map(renderBeatCard)}
          </div>
          <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
            {rightColumn.length === 0
              ? <p className="text-gray-400 text-center">Rien à afficher</p>
              : rightColumn.map(renderBeatCard)}
          </div>
        </div>

        {/* RIGHT: TEMPO knob (compact, fixé) */}
        <div className="md:w-[160px] w-full bg-[#2a2a2a] rounded-xl p-4 grid place-items-center">
          <Knob
            label="TEMPO"
            min={40}
            max={240}
            step={1}
            value={tempo}
            caption={`${Math.round(tempo)} BPM`}
            onChange={setTempo}
          />
        </div>
      </div>

      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-4 rounded-xl text-center space-y-3 max-w-6xl mx-auto">
          <div className="flex flex-nowrap overflow-x-auto justify-center gap-2 mt-6 bg-[#1c1c1c] p-3 rounded-lg">
            {renderButton('acmp', 'ACMP', controls.acmp, () => handleControlClick('acmp'))}
            {renderButton('autofill', 'AUTO-FILL', controls.autofill, () => handleControlClick('autofill'))}

            {['A', 'B', 'C', 'D'].map((i) => {
              const enabled = sectionsAvailability[`Intro ${i}`] === 1;
              return renderButton('intro', `INTRO ${i}`, controls.intro === i && enabled, () => handleControlClick('intro', i), false, !enabled);
            })}

            {['A', 'B', 'C', 'D'].map((m) => {
              const enabled = sectionsAvailability[`Main ${m}`] === 1;
              return renderButton('main', m, controls.main === m && enabled, () => handleControlClick('main', m), mainBlinking === m, !enabled);
            })}

            {['A', 'B', 'C', 'D'].map((i) => {
              const enabled = sectionsAvailability[`Ending ${i}`] === 1 || sectionsAvailability[`End ${i}`] === 1;
              return renderButton('ending', `END ${i}`, controls.ending === i && enabled, () => handleControlClick('ending', i), false, !enabled);
            })}

            <div className="flex flex-col items-center cursor-pointer" onClick={() => handleControlClick('play')}>
              <div
                className={`w-8 h-2 mb-1 rounded-sm ${
                  playColor === 'blue' ? 'bg-blue-500 glow' : playColor === 'orange' ? 'bg-orange-400 glow' : 'bg-black'
                }`}
              />
              <button
                className="text-[10px] bg-gray-300 hover:bg-gray-400 text-black w-16 h-[60px] rounded-md font-bold"
                disabled={isLoading}
                title={isLoading ? 'Chargement en cours...' : controls.play ? 'Arrêter la lecture' : 'Lire le beat'}
              >
                {isLoading ? '⏳' : controls.play ? '⏹ STOP' : '▶️ PLAY'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .glow { box-shadow: 0 0 8px 3px currentColor; }
        @keyframes orangeBlueBlink { 0%, 100% { background-color: orange; } 50% { background-color: blue; } }
        .animate-orange-blue-blink { animation: orangeBlueBlink 1.5s infinite; }
        .flex-nowrap { white-space: nowrap; }
        .cursor-not-allowed { cursor: not-allowed !important; }
      `}</style>
    </div>
  );
}
