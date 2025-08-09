// src/pages/STYPlayerFull.js (ou ton fichier STYPlayer.js)
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState({
    acmp: false,
    autofill: false,
    intro: '',
    main: 'A',
    ending: '',
    play: false,
    disabledChannels: [11, 12, 13, 14, 15, 16],
  });
  const [availableSections, setAvailableSections] = useState({}); // { "Main A": "/temp/..", ... }
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wavUrl, setWavUrl] = useState(null); // optional diagnostic

  const playTimerRef = useRef(null);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // blink sequence (unchanged)
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

  // Play button blinking effect
  useEffect(() => {
    if (controls.play) {
      let index = 0;
      const run = () => {
        const step = blinkSequence[index];
        setPlayColor(step.color);
        playTimerRef.current = setTimeout(() => {
          index = (index + 1) % blinkSequence.length;
          run();
        }, step.duration);
      };
      run();
    } else {
      clearTimeout(playTimerRef.current);
      setPlayColor(null);
    }
    return () => clearTimeout(playTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.play]);

  // Load beats on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }
    axios
      .get('/api/beats/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);

  // Helpers to construct section names
  const introName = (letter) => `Intro ${letter}`;
  const mainName = (letter) => `Main ${letter}`;
  const endingName = (letter) => `Ending ${letter}`;
  const fillName = (code) => `Fill In ${code}`; // code: AA, BB, CC, DD

  // Determine enabled/disabled
  const isSectionAvailable = (sectionName) => !!availableSections[sectionName];
  const sectionWavUrl = (sectionName) => availableSections[sectionName] || null;

  // Select beat -> call prepare-all (extract all sections + convert to wav)
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);
    setAvailableSections({});
    setWavUrl(null);

    // Reset controls
    setControls({
      acmp: false,
      autofill: false,
      intro: '',
      main: 'A',
      ending: '',
      play: false,
      disabledChannels: [11, 12, 13, 14, 15, 16],
    });
    setMainBlinking(null);
    setPlayColor(null);
    clearTimeout(playTimerRef.current);

    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }

    try {
      const token = localStorage.getItem('token');
      // Call prepare-all: server will extract all sections and return which ones are available
      const response = await axios.post(
        '/api/player/prepare-all',
        { beatId: beat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Expect response.data.extracted = [{ section, wavUrl }, ...]
      const extracted = response.data?.extracted || [];
      const map = {};
      for (const item of extracted) {
        if (item.section && item.wavUrl) map[item.section] = item.wavUrl;
      }
      console.log('🔎 Sections extraites:', JSON.stringify(map, null, 2));
      setAvailableSections(map);

      // Choose default main: prefer A if exists otherwise first available main
      if (map[mainName('A')]) {
        setControls((prev) => ({ ...prev, main: 'A' }));
        setWavUrl(map[mainName('A')]);
      } else {
        // find first main available
        const mains = ['A', 'B', 'C', 'D'].find((m) => map[mainName(m)]);
        if (mains) {
          setControls((prev) => ({ ...prev, main: mains }));
          setWavUrl(map[mainName(mains)]);
        } else {
          setWavUrl(null);
        }
      }
    } catch (err) {
      console.error('❌ Échec prepare-all :', err);
      alert('Échec de l’extraction complète du style. Vérifie les logs serveurs.');
    } finally {
      setIsLoading(false);
    }
  };

  // Change main -> simply switch to that main if available (no re-prepare required)
  const handleChangeMain = async (newMain) => {
    if (isLoading || !selectedBeat) return;
    const sName = mainName(newMain);
    if (!isSectionAvailable(sName)) {
      console.warn(`Main ${newMain} non disponible`);
      return;
    }
    setMainBlinking(newMain);
    setControls((prev) => ({ ...prev, main: newMain }));
    setWavUrl(sectionWavUrl(sName));

    setTimeout(() => setMainBlinking(null), 1200);
  };

  // Play / stop using server play-section (keeps current behavior)
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    if (controls.play) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setControls((p) => ({ ...p, play: false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    // Ensure the section is available before asking server to play
    const chosenMain = controls.main;
    const section = mainName(chosenMain);
    const token = localStorage.getItem('token');

    if (!isSectionAvailable(section)) {
      alert(`🎯 Le main ${chosenMain} n'est pas disponible. Sélectionne-en un autre.`);
      return;
    }

    try {
      const playRes = await axios.post(
        '/api/player/play-section',
        { beatId: selectedBeat.id, mainLetter: chosenMain },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const serverWavUrl = playRes.data?.wavUrl || sectionWavUrl(section);
      if (!serverWavUrl) {
        alert('❌ WAV non disponible pour lecture.');
        return;
      }

      if (audioRef.current) {
        audioRef.current.src = serverWavUrl;
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = true;
        try {
          await audioRef.current.play();
          setControls((p) => ({ ...p, play: true }));
        } catch (err) {
          console.error('❌ audio play error', err);
          alert('Impossible de lancer la lecture audio.');
        }
      }
    } catch (err) {
      console.error('❌ /play-section failed', err);
      alert('Erreur lecture section. Vérifie le backend.');
    }
  };

  // Control click handler
  const handleControlClick = (type, value = null) => {
    if (type === 'main') {
      handleChangeMain(value);
      return;
    }
    if (type === 'play') {
      togglePlay();
      return;
    }
    setControls((prev) => {
      const updated = { ...prev };
      if (type === 'acmp' || type === 'autofill') {
        updated[type] = !prev[type];
      } else if (type === 'intro') {
        // toggle intro only if available
        const name = introName(value);
        if (!isSectionAvailable(name)) return prev;
        updated.intro = prev.intro === value ? '' : value;
        updated.ending = '';
      } else if (type === 'ending') {
        const name = endingName(value);
        if (!isSectionAvailable(name)) return prev;
        updated.ending = prev.ending === value ? '' : value;
        updated.intro = '';
      }
      return updated;
    });
  };

  // Helpers for rendering
  const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = currentPageBeats.slice(0, 10);
  const rightColumn = currentPageBeats.slice(10, 20);

  const renderBeatCard = (beat) => (
    <div
      key={beat.id}
      onClick={() => handleSelectBeat(beat)}
      className={`flex items-center gap-3 cursor-pointer p-2 mb-2 rounded-md transition hover:bg-blue-700 ${
        selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'
      }`}
      title={`Tempo: ${beat.tempo} BPM, Signature: ${beat.signature}`}
    >
      <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
        <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
      </div>
      <div>
        <p className="font-semibold">{beat.title}</p>
        <p className="text-sm text-gray-400">
          {beat.signature} - {beat.tempo} BPM
        </p>
      </div>
    </div>
  );

  // renderButton now accepts disabled and renders indicator accordingly
  const renderButton = (type, label, isActive, onClick, opts = {}) => {
    const { isBlinking = false, disabled = false } = opts;
    // indicator color: if disabled -> black, else follow previous logic
    let indicatorClass = 'bg-transparent';
    if (disabled) {
      indicatorClass = 'bg-black';
    } else if (type === 'acmp' || type === 'autofill') {
      indicatorClass = isActive ? 'bg-orange-400 glow' : 'bg-black';
    } else if (type === 'main') {
      indicatorClass = isBlinking ? 'animate-orange-blue-blink' : isActive ? 'bg-blue-500 glow' : 'bg-orange-400';
    } else {
      indicatorClass = isActive ? 'bg-orange-400 glow' : 'bg-transparent';
    }

    return (
      <div className="flex flex-col items-center select-none">
        <div className={`w-8 h-2 mb-1 rounded-sm transition-all duration-300 ${indicatorClass}`} />
        <button
          onClick={disabled ? undefined : onClick}
          className={`text-white ${disabled ? 'bg-gray-800 opacity-60 cursor-not-allowed' : 'bg-[#333] hover:bg-gray-600'} w-16 h-[60px] rounded-md font-bold`}
          style={{ fontSize: type === 'main' ? '1.2rem' : '0.65rem' }}
          disabled={disabled || (isLoading && type === 'play')}
          title={disabled ? 'Non disponible' : undefined}
        >
          {label}
        </button>
      </div>
    );
  };

  function getIconPath(title) {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  }

  // page nav
  const canGoPrev = page > 0;
  const canGoNext = (page + 1) * ITEMS_PER_PAGE < beats.length;

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      <audio ref={audioRef} hidden />
      <h1 className="text-3xl font-bold text-center mb-4">🎧 PSR MANAGER STYLE</h1>

      {/* Beats list */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {leftColumn.length === 0 ? <p className="text-gray-400 text-center">Aucun beat disponible</p> : leftColumn.map(renderBeatCard)}
        </div>
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {rightColumn.length === 0 ? <p className="text-gray-400 text-center">Rien à afficher</p> : rightColumn.map(renderBeatCard)}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-4 mb-6">
        <button onClick={() => canGoPrev && setPage((p) => p - 1)} disabled={!canGoPrev} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded">← Précédent</button>
        <button onClick={() => canGoNext && setPage((p) => p + 1)} disabled={!canGoNext} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded">Suivant →</button>
      </div>

      {/* Selected beat controls */}
      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-4 rounded-xl text-center space-y-3 max-w-9xl mx-auto">
          <h2 className="text-xl font-semibold">{selectedBeat.title}</h2>
          <p className="text-gray-400">Tempo : {selectedBeat.tempo} BPM</p>
          <p className="text-gray-400">Signature : {selectedBeat.signature}</p>
          <p className="text-gray-400">Description : {selectedBeat.description || 'Aucune'}</p>

          <div className="flex flex-nowrap overflow-x-auto justify-center gap-2 mt-6 bg-[#1c1c1c] p-3 rounded-lg">
            {renderButton('acmp', 'ACMP', controls.acmp, () => handleControlClick('acmp'))}
            {renderButton('autofill', 'AUTO-FILL', controls.autofill, () => handleControlClick('autofill'))}

            {/* Intros A-D */}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton(
                'intro',
                `INTRO ${i}`,
                controls.intro === i,
                () => handleControlClick('intro', i),
                { disabled: !isSectionAvailable(introName(i)) }
              )
            )}

            {/* Fill In AA..DD (we keep only 4 codes) */}
            {['AA', 'BB', 'CC', 'DD'].map((code) =>
              renderButton(
                'fill',
                `FILL ${code}`,
                false,
                () => {
                  // if we want to support play-of-fill later
                },
                { disabled: !isSectionAvailable(fillName(code)) }
              )
            )}

            {/* Mains A-D */}
            {['A', 'B', 'C', 'D'].map((m) =>
              renderButton(
                'main',
                m,
                controls.main === m,
                () => handleControlClick('main', m),
                { isBlinking: mainBlinking === m, disabled: !isSectionAvailable(mainName(m)) }
              )
            )}

            {/* Endings A-D */}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton(
                'ending',
                `END ${i}`,
                controls.ending === i,
                () => handleControlClick('ending', i),
                { disabled: !isSectionAvailable(endingName(i)) }
              )
            )}

            {/* Play button */}
            <div className="flex flex-col items-center cursor-pointer" onClick={() => handleControlClick('play')}>
              <div className={`w-8 h-2 mb-1 rounded-sm ${playColor === 'blue' ? 'bg-blue-500 glow' : playColor === 'orange' ? 'bg-orange-400 glow' : 'bg-black'}`} />
              <button className="text-[10px] bg-gray-300 hover:bg-gray-400 text-black w-16 h-[60px] rounded-md font-bold" disabled={isLoading} title={isLoading ? "Chargement..." : controls.play ? "Arrêter" : "Lire"}>
                {isLoading ? '⏳' : controls.play ? '⏹ STOP' : '▶️ PLAY'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .glow { box-shadow: 0 0 8px 3px currentColor; }
        @keyframes orangeBlueBlink { 0%,100% { background-color: orange } 50% { background-color: blue } }
        .animate-orange-blue-blink { animation: orangeBlueBlink 1.5s infinite; }
        .flex-nowrap { white-space: nowrap; }
      `}</style>
    </div>
  );
}
