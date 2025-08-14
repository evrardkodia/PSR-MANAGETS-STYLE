import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

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
    // sectionName par ex "Main A", "Intro B", "Fill In AA", "Ending B"
    const filename = `${beatId}_${sectionName.replace(/ /g, '_')}.wav`;
    return `https://swtbkiudmfvnywcgpzfe.supabase.co/storage/v1/object/public/midiAndWav/${beatId}/${filename}`;
  };

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

  // --- SELECT BEAT (ne lance PAS la conversion, juste récupère les sections via /prepare-all) ---
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);

    // reset controls & audio
    setControls({
      acmp: false,
      autofill: false,
      intro: '',
      main: 'A',
      ending: '',
      play: false,
    });
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

    try {
      const token = localStorage.getItem('token');
      // prepare-all renvoie uniquement disponibilité des sections (map)
      const prepareAllResp = await axios.post(
        '/api/player/prepare-all',
        { beatId: beat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (prepareAllResp.data.sections) {
        // attend un objet { "Main A":1, "Intro B":1, ... } — c'est ton format actuel
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

  // --- Play a specific section (used by togglePlay and control clicks) ---
  // sectionName example: "Main A", "Intro B", "Ending C", "Fill In AA"
  const playSection = async (sectionName) => {
    if (!selectedBeat) return;
    if (!sectionsAvailability || sectionsAvailability[sectionName] !== 1) {
      console.warn('Section non disponible:', sectionName);
      return;
    }

    const beatId = selectedBeat.id;
    const url = getSupabaseWavUrl(beatId, sectionName);

    // If it's a Main -> put into mainAudio (loop)
    if (/^Main\s[ABCD]$/i.test(sectionName)) {
      // stop oneShot if playing
      if (oneShotAudioRef.current && !oneShotAudioRef.current.paused) {
        oneShotAudioRef.current.pause();
        oneShotAudioRef.current.currentTime = 0;
      }

      // load main audio and loop it
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
      // update controls state (which main is active)
      const m = sectionName.split(' ')[1];
      setControls((prev) => ({ ...prev, main: m }));
      setMainBlinking(m);
      setTimeout(() => setMainBlinking(null), 2000);
      return;
    }

    // If it's one-shot (Intro / Ending / Fill In) -> play on oneShotAudio
    const oneEl = oneShotAudioRef.current;
    if (!oneEl) return;

    // If a main is currently playing, pause it (we'll resume or switch after one-shot)
    const mainEl = mainAudioRef.current;
    const wasMainPlaying = mainEl && !mainEl.paused && mainEl.currentSrc;

    if (wasMainPlaying) {
      try {
        // pause main but keep its src so we can restart later
        mainEl.pause();
      } catch (e) {
        console.warn('pause main failed', e);
      }
    }

    // Prepare new main candidate in background? We'll preload the target main before switching when needed.
    oneEl.src = url;
    oneEl.loop = false;
    oneEl.preload = 'auto';

    // play one-shot
    try {
      await oneEl.play();
      setControls((prev) => ({ ...prev, play: true }));
    } catch (err) {
      console.error('Impossible de jouer one-shot:', err);
      // if main was playing, try to resume it
      if (wasMainPlaying && mainEl) mainEl.play().catch(() => {});
      return;
    }

    // When one-shot ends, decide what to do:
    const onEnded = async () => {
      oneEl.removeEventListener('ended', onEnded);

      // If the one-shot was an Intro or Ending -> resume the previously active main (or default main)
      if (/^Intro\s[ABCD]$/i.test(sectionName) || /^Ending\s[ABCD]$/i.test(sectionName)) {
        // resume the main currently specified in controls (or default A)
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

      // If the one-shot was a Fill In XX -> switch to the corresponding Main
      const fillMatch = sectionName.match(/^Fill In\s([A-D])\1$/i); // e.g. Fill In AA -> group A
      if (fillMatch) {
        const newMain = fillMatch[1].toUpperCase();
        const newMainUrl = getSupabaseWavUrl(beatId, `Main ${newMain}`);

        // preload new main by setting src then play immediately
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

      // fallback: resume main
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

  // toggle play: seul bouton capable de démarrer/arrêter la lecture
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    // STOP
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

    // START: déterminer quelle section est active (intro > main > ending)
    let sectionToPlay = null;
    if (controls.intro) sectionToPlay = `Intro ${controls.intro}`;
    else if (controls.main) sectionToPlay = `Main ${controls.main}`;
    else if (controls.ending) sectionToPlay = `Ending ${controls.ending}`;

    if (!sectionToPlay) {
      console.warn('Aucune section active pour démarrer la lecture.');
      return;
    }
    if (!sectionsAvailability[sectionToPlay]) {
      // si la section active n'existe pas, cherche un main disponible par défaut
      const fallback = Object.keys(sectionsAvailability).find((k) => /^Main\s[ABCD]$/i.test(k) && sectionsAvailability[k] === 1);
      if (fallback) sectionToPlay = fallback;
      else {
        alert('Aucune section disponible à jouer.');
        return;
      }
    }

    // Lance la lecture de la section choisie
    try {
      await playSection(sectionToPlay);
    } catch (err) {
      console.error('Erreur pendant playSection:', err);
      alert('Impossible de démarrer la lecture.');
      setControls((prev) => ({ ...prev, play: false }));
    }
  };

  // handleControlClick: en mode HORS-LECTURE -> n'active que le voyant (ne joue pas)
  // en mode LECTURE -> déclenche comportement intelligent (main switch via fill / intro/ending one-shot)
  const handleControlClick = (type, value = null) => {
    if (!type) return;

    // Convert value to uppercase letter(s)
    const letter = value ? String(value).toUpperCase() : '';

    // If play is false => only update active selection (no playback)
    if (!controls.play) {
      if (type === 'main') {
        setControls((prev) => ({ ...prev, main: letter }));
        setMainBlinking(letter);
        setTimeout(() => setMainBlinking(null), 1200);
        return;
      }
      if (type === 'intro') {
        setControls((prev) => ({ ...prev, intro: letter, ending: '' }));
        return;
      }
      if (type === 'ending') {
        setControls((prev) => ({ ...prev, ending: letter, intro: '' }));
        return;
      }
      if (type === 'acmp' || type === 'autofill') {
        setControls((prev) => ({ ...prev, [type]: !prev[type] }));
        return;
      }
      if (type === 'play') {
        togglePlay();
        return;
      }
      return;
    }

    // If playing => interactive behavior
    if (type === 'main') {
      const targetMain = letter;
      // If same main clicked -> do nothing
      if (controls.main === targetMain) return;

      // schedule: play Fill In XX (if exists) otherwise directly switch to Main target
      const fillName = `Fill In ${targetMain}${targetMain}`; // Fill In AA, BB...
      if (sectionsAvailability[fillName] === 1) {
        // play fill, then in its 'ended' handler we'll switch to Main target (logic in playSection)
        playSection(fillName);
      } else {
        // if no fill available, directly switch to new main
        playSection(`Main ${targetMain}`);
      }
      // update control selected main immediately (UI)
      setControls((prev) => ({ ...prev, main: targetMain }));
      setMainBlinking(targetMain);
      setTimeout(() => setMainBlinking(null), 1500);
      return;
    }

    if (type === 'intro' || type === 'ending') {
      const sectionName = `${type.charAt(0).toUpperCase() + type.slice(1)} ${letter}`;
      if (sectionsAvailability[sectionName] !== 1) return;
      // play the one-shot intro/ending and then resume current main (handled by playSection)
      playSection(sectionName);
      // update controls selection display
      setControls((prev) => {
        if (type === 'intro') return { ...prev, intro: letter, ending: '' };
        return { ...prev, ending: letter, intro: '' };
      });
      return;
    }

    if (type === 'acmp' || type === 'autofill') {
      setControls((prev) => ({ ...prev, [type]: !prev[type] }));
      return;
    }

    if (type === 'play') {
      togglePlay();
      return;
    }
  };

  // pagination helpers
  const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
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
          disabled={isLoading && type === 'play' || disabled}
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

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {leftColumn.length === 0 ? <p className="text-gray-400 text-center">Aucun beat disponible</p> : leftColumn.map(renderBeatCard)}
        </div>
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {rightColumn.length === 0 ? <p className="text-gray-400 text-center">Rien à afficher</p> : rightColumn.map(renderBeatCard)}
        </div>
      </div>

      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-4 rounded-xl text-center space-y-3 max-w-9xl mx-auto">
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
        .glow {
          box-shadow: 0 0 8px 3px currentColor;
        }
        @keyframes orangeBlueBlink {
          0%, 100% { background-color: orange; }
          50% { background-color: blue; }
        }
        .animate-orange-blue-blink { animation: orangeBlueBlink 1.5s infinite; }
        .flex-nowrap { white-space: nowrap; }
        .cursor-not-allowed { cursor: not-allowed !important; }
      `}</style>
    </div>
  );
}
