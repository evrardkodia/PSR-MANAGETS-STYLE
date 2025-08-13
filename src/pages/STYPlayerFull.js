import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [sectionsAvailability, setSectionsAvailability] = useState({});
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
  const [wavUrl, setWavUrl] = useState(null);

  const audioRef = useRef(null);
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

  // Fonction générique pour générer l'URL Supabase
  const getSupabaseWavUrl = (beatId, sectionName) => {
    const filename = `${beatId}_${sectionName.replace(/ /g, '_')}.wav`;
    return `https://swtbkiudmfvnywcgpzfe.supabase.co/storage/v1/object/public/midiAndWav/${beatId}/${filename}`;
  };

  // Blinking play indicator
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

  // Charger les beats
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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);

  // Sélection du beat
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);

    // Reset controls et audio
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

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setWavUrl(null);
    setSectionsAvailability({});

    try {
      const token = localStorage.getItem('token');

      // Récupérer toutes les sections disponibles
      const prepareAllResp = await axios.post(
        '/api/player/prepare-all',
        { beatId: beat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (prepareAllResp.data.sections) {
        setSectionsAvailability(prepareAllResp.data.sections);
        console.log('Sections détectées:', prepareAllResp.data.sections);
      } else {
        console.warn('Aucune section détectée');
        setSectionsAvailability({});
      }
    } catch (err) {
      console.error('❌ Préparation du beat échouée :', err);
      alert("❌ Échec de la préparation du beat");
      setSectionsAvailability({});
    } finally {
      setIsLoading(false);
    }
  };

  // Lecture d’une section spécifique
  const handlePlaySection = async (sectionName) => {
    if (!selectedBeat) return;
    if (sectionsAvailability[sectionName] !== 1) return;

    const url = getSupabaseWavUrl(selectedBeat.id, sectionName);
    setWavUrl(url);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.currentTime = 0;

      // Boucle seulement pour les Main
      audioRef.current.loop = /^Main\s[ABCD]$/.test(sectionName);
      try {
        await audioRef.current.play();
        setControls((prev) => ({ ...prev, play: true }));
      } catch (err) {
        console.error('❌ Lecture audio échouée :', err);
      }
    }

    // Mettre à jour le contrôle actif
    const typeMatch = sectionName.match(/^(Main|Intro|Ending)\s([ABCD]{1,2})$/);
    if (!typeMatch) return;
    const [, type, letter] = typeMatch;

    setControls((prev) => ({
      ...prev,
      main: type === 'Main' ? letter : prev.main,
      intro: type === 'Intro' ? letter : prev.intro,
      ending: type === 'Ending' ? letter : prev.ending,
    }));

    if (type === 'Main') {
      setMainBlinking(letter);
      setTimeout(() => setMainBlinking(null), 2000);
    }
  };

  // Toggle play/pause
// Toggle play/pause
const togglePlay = async () => {
  if (!selectedBeat || isLoading) return;

  if (controls.play) {
    // STOP
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setControls((prev) => ({ ...prev, play: false }));
    setPlayColor(null);
    clearTimeout(playTimerRef.current);
  } else {
    // Si aucun wav déjà défini, on regarde quel voyant est actif
    if (!wavUrl) {
      let sectionName = null;

      if (controls.intro) sectionName = `Intro ${controls.intro}`;
      else if (controls.main) sectionName = `Main ${controls.main}`;
      else if (controls.ending) sectionName = `Ending ${controls.ending}`;

      if (sectionName && sectionsAvailability[sectionName] === 1) {
        await handlePlaySection(sectionName);
        return; // handlePlaySection va lancer la lecture
      } else {
        console.warn("⚠️ Aucune section active trouvée pour jouer");
        return;
      }
    }

    // Si on a déjà un wavUrl, juste lecture
    audioRef.current.loop = true;
    try {
      await audioRef.current.play();
      setControls((prev) => ({ ...prev, play: true }));
    } catch (err) {
      console.error(err);
    }
  }
};


  const handleControlClick = (type, value = null) => {
    if (type === 'main' || type === 'intro' || type === 'ending') {
      const sectionName = `${type.charAt(0).toUpperCase() + type.slice(1)} ${value}`;
      handlePlaySection(sectionName);
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

  // Pagination
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
      <audio ref={audioRef} hidden />
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

            {renderButton('play', controls.play ? '⏹ STOP' : '▶️ PLAY', controls.play, () => handleControlClick('play'))}
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
        .animate-orange-blue-blink {
          animation: orangeBlueBlink 1.5s infinite;
        }
        .flex-nowrap {
          white-space: nowrap;
        }
        .cursor-not-allowed {
          cursor: not-allowed !important;
        }
      `}</style>
    </div>
  );
}
