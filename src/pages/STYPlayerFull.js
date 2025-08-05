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
  const [mainBlinking, setMainBlinking] = useState(null);
  const [playColor, setPlayColor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wavUrl, setWavUrl] = useState(null); // conservé pour info/diagnostic

  const playTimerRef = useRef(null);
  const blinkStepIndex = useRef(0);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;

  // Séquence de clignotement pour le bouton Play
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

  // Clignotement bouton Play quand en lecture
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

  // Chargement des beats au montage
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

  // Nettoyer l'audio à la destruction du composant
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);

  // Sélection d'un beat -> déclenche préparation main + wav côté backend
  const handleSelectBeat = async (beat) => {
    if (isLoading) return;
    setIsLoading(true);
    setSelectedBeat(beat);

    // Reset controls à état initial
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

    // Stop audio et reset source
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setWavUrl(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/player/prepare-main',
        {
          beatId: beat.id,
          mainLetter: 'A',
          acmpEnabled: false,
          disabledChannels: [11, 12, 13, 14, 15, 16],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.wavUrl) {
        setWavUrl(response.data.wavUrl); // relative (ex: /temp/...)
      } else {
        alert("❌ Erreur: fichier WAV non disponible après préparation");
      }
    } catch (err) {
      console.error('❌ Préparation du beat échouée :', err);
      alert("❌ Échec de la préparation du beat");
    } finally {
      setIsLoading(false);
    }
  };

  // Changement de main (A,B,C,D) -> re-préparer WAV main
  const handleChangeMain = async (newMain) => {
    if (isLoading || !selectedBeat) return;
    setMainBlinking(newMain);
    setControls((prev) => ({ ...prev, main: newMain }));

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/player/prepare-main',
        {
          beatId: selectedBeat.id,
          mainLetter: newMain,
          acmpEnabled: controls.acmp,
          disabledChannels: controls.disabledChannels,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.wavUrl) {
        setWavUrl(response.data.wavUrl);
      } else {
        alert("❌ Erreur: fichier WAV non disponible après préparation");
      }
    } catch (err) {
      console.error('❌ Préparation main échouée :', err);
      alert("❌ Échec de la préparation du main");
    } finally {
      setIsLoading(false);
    }

    setTimeout(() => setMainBlinking(null), 2000);
  };

  // Toggle play/pause avec lecture WAV via l'URL renvoyée par /play-section
  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou chargement en cours.');
      return;
    }

    // STOP
    if (controls.play) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setControls((prev) => ({ ...prev, play: false }));
      setPlayColor(null);
      clearTimeout(playTimerRef.current);
      return;
    }

    // PLAY : demander au backend l'URL lisible (absolue) du WAV
    try {
      const token = localStorage.getItem('token');
      const playRes = await axios.post(
        '/api/player/play-section',
        { beatId: selectedBeat.id, mainLetter: controls.main },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const serverWavUrl = playRes.data?.wavUrl;
      if (!serverWavUrl) {
        console.error('❌ /play-section n’a pas renvoyé wavUrl');
        alert('❌ WAV non disponible. Réessayez de préparer le main.');
        return;
      }

      if (audioRef.current) {
        audioRef.current.src = serverWavUrl; // URL ABSOLUE
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = true;
        await audioRef.current.play();
        setControls((prev) => ({ ...prev, play: true }));
      }
    } catch (err) {
      console.error('❌ Lecture échouée:', err);
      // Info utile en debug :
      if (wavUrl) console.warn('Note: wavUrl (de prepare-main) était:', wavUrl);
      alert('❌ Impossible de lire le WAV. Vérifiez que le main est préparé.');
    }
  };

  // Gère clics sur boutons
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
        updated.intro = prev.intro === value ? '' : value;
        updated.ending = '';
      } else if (type === 'ending') {
        updated.ending = prev.ending === value ? '' : value;
        updated.intro = '';
      }
      return updated;
    });
  };

  // Pagination
  const currentPageBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = currentPageBeats.slice(0, 10);
  const rightColumn = currentPageBeats.slice(10, 20);

  // Rendu carte beat
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

  // Rendu bouton avec styles et clignotement
  const renderButton = (type, label, isActive, onClick, isBlinking = false) => {
    let colorClass = 'bg-transparent';
    if (type === 'acmp' || type === 'autofill') {
      colorClass = isActive ? 'bg-orange-400 glow' : 'bg-black';
    } else if (type === 'main') {
      colorClass = isBlinking ? 'animate-orange-blue-blink' : isActive ? 'bg-blue-500 glow' : 'bg-orange-400';
    } else {
      colorClass = isActive ? 'bg-orange-400 glow' : 'bg-transparent';
    }

    return (
      <div onClick={onClick} className="flex flex-col items-center cursor-pointer select-none">
        <div className={`w-8 h-2 mb-1 rounded-sm transition-all duration-300 ${colorClass}`} />
        <button
          className="text-white bg-[#333] w-16 h-[60px] rounded-md font-bold"
          style={{ fontSize: type === 'main' ? '1.2rem' : '0.65rem' }}
          disabled={isLoading && type === 'play'}
        >
          {label}
        </button>
      </div>
    );
  };

  // Génère chemin icône en fonction du titre
  const getIconPath = (title) => {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  };

  // Pagination simple boutons précédent / suivant
  const canGoPrev = page > 0;
  const canGoNext = (page + 1) * ITEMS_PER_PAGE < beats.length;

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6 select-none">
      <audio ref={audioRef} hidden />
      <h1 className="text-3xl font-bold text-center mb-4">🎧 PSR MANAGER STYLE</h1>

      {/* Liste beats */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {leftColumn.length === 0 ? (
            <p className="text-gray-400 text-center">Aucun beat disponible</p>
          ) : (
            leftColumn.map(renderBeatCard)
          )}
        </div>
               <div className="bg-[#2a2a2a] p-4 rounded-xl shadow-inner">
          {rightColumn.length === 0 ? (
            <p className="text-gray-400 text-center">Rien à afficher</p>
          ) : (
            rightColumn.map(renderBeatCard)
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={() => canGoPrev && setPage((p) => p - 1)}
          disabled={!canGoPrev}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded"
        >
          ← Précédent
        </button>
        <button
          onClick={() => canGoNext && setPage((p) => p + 1)}
          disabled={!canGoNext}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 px-4 rounded"
        >
          Suivant →
        </button>
      </div>

      {/* Contrôles et infos du beat sélectionné */}
      {selectedBeat && (
        <div className="bg-[#2a2a2a] p-4 rounded-xl text-center space-y-3 max-w-9xl mx-auto">
          <h2 className="text-xl font-semibold">{selectedBeat.title}</h2>
          <p className="text-gray-400">Tempo : {selectedBeat.tempo} BPM</p>
          <p className="text-gray-400">Signature : {selectedBeat.signature}</p>
          <p className="text-gray-400">Description : {selectedBeat.description || 'Aucune'}</p>

          {/* Boutons de contrôle */}
          <div className="flex flex-nowrap overflow-x-auto justify-center gap-2 mt-6 bg-[#1c1c1c] p-3 rounded-lg">
            {renderButton('acmp', 'ACMP', controls.acmp, () => handleControlClick('acmp'))}
            {renderButton('autofill', 'AUTO-FILL', controls.autofill, () => handleControlClick('autofill'))}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton('intro', `INTRO ${i}`, controls.intro === i, () => handleControlClick('intro', i))
            )}
            {['A', 'B', 'C', 'D'].map((m) =>
              renderButton('main', m, controls.main === m, () => handleControlClick('main', m), mainBlinking === m)
            )}
            {['A', 'B', 'C', 'D'].map((i) =>
              renderButton('ending', `END ${i}`, controls.ending === i, () => handleControlClick('ending', i))
            )}

            {/* Bouton play */}
            <div className="flex flex-col items-center cursor-pointer" onClick={() => handleControlClick('play')}>
              <div
                className={`w-8 h-2 mb-1 rounded-sm ${
                  playColor === 'blue'
                    ? 'bg-blue-500 glow'
                    : playColor === 'orange'
                    ? 'bg-orange-400 glow'
                    : 'bg-black'
                }`}
              />
              <button
                className="text-[10px] bg-gray-300 hover:bg-gray-400 text-black w-16 h-[60px] rounded-md font-bold"
                disabled={isLoading}
                title={isLoading ? "Chargement en cours..." : controls.play ? "Arrêter la lecture" : "Lire le beat"}
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
        .animate-orange-blue-blink {
          animation: orangeBlueBlink 1.5s infinite;
        }
        /* Scroll horizontal pour boutons contrôle si overflow */
        .flex-nowrap {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
