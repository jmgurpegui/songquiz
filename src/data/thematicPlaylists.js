/**
 * @fileoverview Catálogo curado de Listas Populares por Temática en YouTube Music.
 * Cada lista incluye canciones verificadas con sus IDs oficiales de YouTube,
 * estrofas bilingües (EN/ES) para el modo Lyrics Challenge y contexto cultural.
 */

export const THEMATIC_PLAYLISTS = [
  {
    id: 'pop_hits',
    name: '🔥 Top Global Pop & Hits Actuales',
    category: 'Pop Internacional',
    description: 'Los mayores éxitos del pop moderno mundial con ritmos contagiosos y estribillos inolvidables.',
    youtubeUrl: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    playlistId: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i',
    badge: 'Tendencia',
    songs: [
      {
        id: 'blinding_lights',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        genre: 'Synthwave / Pop',
        year: 2019,
        audioSrc: 'assets/audio/blinding_lights.wav',
        youtubeId: '4NRXx6U8ABQ',
        lyrics: {
          en: "I've been tryna call\nI've been on my own for long enough\nMaybe you can show me how to love, maybe\nI'm going through withdrawals",
          es: "He estado intentando llamar\nHe estado solo durante demasiado tiempo\nTal vez puedas enseñarme cómo amar, quizá\nEstoy pasando por síndrome de abstinencia"
        },
        culturalTrivia: 'Inspirada en el sonido synth-pop de los años 80 (especialmente a-ha y Depeche Mode), superó a "The Twist" de Chubby Checker como la canción número 1 histórica del ranking Billboard Hot 100 de todos los tiempos.'
      },
      {
        id: 'shape_of_you',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        genre: 'Tropical House / Pop',
        year: 2017,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: 'JGwWNGJdvx8',
        lyrics: {
          en: "The club isn't the best place to find a lover\nSo the bar is where I go\nMe and my friends at the table doing shots\nDrinking fast and then we talk slow",
          es: "El club no es el mejor lugar para encontrar pareja\nAsí que al bar es a donde voy\nMis amigos y yo en la mesa tomando tragos\nBebiendo rápido y luego hablamos despacio"
        },
        culturalTrivia: 'Ed Sheeran la compuso originalmente pensando en Rihanna. Su ostinato rítmico de marimba tropical se convirtió en la primera pista de la historia en superar los 3.000 millones de reproducciones.'
      },
      {
        id: 'levitating',
        title: 'Levitating',
        artist: 'Dua Lipa',
        genre: 'Nu-Disco / Pop',
        year: 2020,
        audioSrc: 'assets/audio/blinding_lights.wav',
        youtubeId: 'TUVcZfQe-Kw',
        lyrics: {
          en: "If you wanna run away with me, I know a galaxy\nAnd I can take you for a ride\nI had a premonition that we fell into a rhythm\nWhere the music don't stop for life",
          es: "Si quieres escaparte conmigo, conozco una galaxia\nY puedo llevarte a dar un paseo\nTuve una premonición de que caíamos en un ritmo\nDonde la música no se detiene de por vida"
        },
        culturalTrivia: 'Perteneciente al aclamado álbum "Future Nostalgia", fusiona el funk espacial de los años 70 con sintetizadores analógicos modernos.'
      },
      {
        id: 'as_it_was',
        title: 'As It Was',
        artist: 'Harry Styles',
        genre: 'Indie Pop / Synth-Pop',
        year: 2022,
        audioSrc: 'assets/audio/take_on_me.wav',
        youtubeId: 'H5v3kku4y6Q',
        lyrics: {
          en: "In this world, it's just us\nYou know it's not the same as it was\nAnswer the phone\nHarry, you're no good alone",
          es: "En este mundo, solo somos nosotros\nSabes que ya no es igual que antes\nContesta el teléfono\nHarry, no estás bien estando solo"
        },
        culturalTrivia: 'La voz infantil que abre la canción diciendo "Come on, Harry, we wanna say goodnight to you!" pertenece a Ruby, la ahijada de cinco años de Harry Styles.'
      },
      {
        id: 'flowers',
        title: 'Flowers',
        artist: 'Miley Cyrus',
        genre: 'Disco-Pop / Funk',
        year: 2023,
        audioSrc: 'assets/audio/stayin_alive.wav',
        youtubeId: 'G7KNmW9a75Y',
        lyrics: {
          en: "I can buy myself flowers\nWrite my name in the sand\nTalk to myself for hours\nSay things you don't understand",
          es: "Puedo comprarme flores a mí misma\nEscribir mi nombre en la arena\nHablar conmigo misma durante horas\nDecir cosas que tú no entiendes"
        },
        culturalTrivia: 'Su estribillo responde líricamente a "When I Was Your Man" de Bruno Mars, transformando una balada de arrepentimiento en un himno mundial de autosuficiencia y amor propio, ganando el Grammy a Grabación del Año.'
      },
      {
        id: 'uptown_funk',
        title: 'Uptown Funk',
        artist: 'Mark Ronson ft. Bruno Mars',
        genre: 'Funk / Soul Pop',
        year: 2014,
        audioSrc: 'assets/audio/billie_jean.wav',
        youtubeId: 'OPf0YbXqDm0',
        lyrics: {
          en: "This hit, that ice cold\nMichelle Pfeiffer, that white gold\nThis one for them hood girls\nThem good girls straight masterpieces",
          es: "Este éxito, tan frío como el hielo\nMichelle Pfeiffer, ese oro blanco\nEsta va para las chicas del barrio\nEsas chicas buenas, auténticas obras maestras"
        },
        culturalTrivia: 'Tardó más de 6 meses en grabarse; Bruno Mars y Mark Ronson repitieron la toma de guitarra más de 80 veces para lograr el groove exacto del funk de Minneapolis de los años 80.'
      }
    ]
  },
  {
    id: 'rock_legends',
    name: '🎸 Leyendas del Rock & Himnos de Estadio',
    category: 'Rock Clásico',
    description: 'Riffs inmortales, solos de guitarra históricos y las voces más potentes de la historia del rock.',
    youtubeUrl: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM',
    playlistId: 'PL4fGSI1pDJn5kI81J1fYWK5eZRl1zJ5kM',
    badge: 'Imprescindible',
    songs: [
      {
        id: 'bohemian_rhapsody',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        genre: 'Progressive Rock',
        year: 1975,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'fJ9rUzIMcZQ',
        lyrics: {
          en: "Is this the real life? Is this just fantasy?\nCaught in a landslide, no escape from reality\nOpen your eyes, look up to the skies and see",
          es: "¿Es esto la vida real? ¿Es solo fantasía?\nAtrapado en un derrumbe, sin escape de la realidad\nAbre tus ojos, mira hacia los cielos y observa"
        },
        culturalTrivia: 'Escrita por Freddie Mercury para el álbum "A Night at the Opera" (1975). Rompió todos los esquemas radiofónicos con sus 6 minutos de duración, uniendo balada, ópera y hard rock sin tener un estribillo tradicional.'
      },
      {
        id: 'smells_like_teen_spirit',
        title: 'Smells Like Teen Spirit',
        artist: 'Nirvana',
        genre: 'Grunge / Alternative Rock',
        year: 1991,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'hTWKbfoikeg',
        lyrics: {
          en: "With the lights out, it's less dangerous\nHere we are now, entertain us\nI feel stupid and contagious\nHere we are now, entertain us",
          es: "Con las luces apagadas, es menos peligroso\nAquí estamos ahora, entreténgannos\nMe siento estúpido y contagioso\nAquí estamos ahora, entreténgannos"
        },
        culturalTrivia: 'El título nació cuando Kathleen Hanna escribió en la pared de Kurt Cobain "Kurt smells like Teen Spirit", refiriéndose a una marca de desodorante juvenil; Cobain no sabía que era una marca y lo interpretó como un lema revolucionario.'
      },
      {
        id: 'sweet_child_o_mine',
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        genre: 'Hard Rock',
        year: 1987,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: '1w7OgIMMRc4',
        lyrics: {
          en: "She's got a smile that it seems to me\nReminds me of childhood memories\nWhere everything was as fresh as the bright blue sky",
          es: "Ella tiene una sonrisa que a mí me parece\nQue me recuerda a memorias de la infancia\nDonde todo era tan fresco como el brillante cielo azul"
        },
        culturalTrivia: 'El legendario riff inicial de Slash nació como un simple ejercicio de calentamiento con salto de cuerdas que estaba tocando en broma mientras el resto de la banda descansaba.'
      },
      {
        id: 'livin_on_a_prayer',
        title: "Livin' on a Prayer",
        artist: 'Bon Jovi',
        genre: 'Glam Metal / Arena Rock',
        year: 1986,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'lDK9QqIzhwk',
        lyrics: {
          en: "Whoa, we're half way there\nWhoa, livin' on a prayer\nTake my hand, we'll make it I swear",
          es: "¡Oh, estamos a mitad de camino!\n¡Oh, viviendo de una oración!\nToma mi mano, lo lograremos, te lo juro"
        },
        culturalTrivia: 'Narra la historia de Tommy y Gina, una pareja ficticia de clase trabajadora que simboliza la lucha económica de los años 80. Richie Sambora utilizó el icónico pedal "Talk Box" para hacer hablar a su guitarra.'
      },
      {
        id: 'hotel_california',
        title: 'Hotel California',
        artist: 'Eagles',
        genre: 'Classic Rock',
        year: 1977,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: '09839DpTctU',
        lyrics: {
          en: "Welcome to the Hotel California\nSuch a lovely place, such a lovely face\nPlenty of room at the Hotel California\nAny time of year, you can find it here",
          es: "Bienvenido al Hotel California\nUn lugar tan encantador, un rostro tan hermoso\nHay mucho espacio en el Hotel California\nEn cualquier época del año, puedes encontrarlo aquí"
        },
        culturalTrivia: 'Su extenso duelo final de guitarras eléctricas entre Don Felder y Joe Walsh fue votado por la revista Guitarist como el mejor solo de guitarra de todos los tiempos.'
      },
      {
        id: 'dont_stop_believin',
        title: "Don't Stop Believin'",
        artist: 'Journey',
        genre: 'Arena Rock',
        year: 1981,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: '1k8craCGpgs',
        lyrics: {
          en: "Just a small town girl, livin' in a lonely world\nShe took the midnight train goin' anywhere\nJust a city boy, born and raised in South Detroit",
          es: "Solo una chica de pueblo, viviendo en un mundo solitario\nTomó el tren de medianoche hacia cualquier lugar\nSolo un chico de ciudad, nacido y criado en el sur de Detroit"
        },
        culturalTrivia: 'Curiosamente, el famoso estribillo que da título a la canción no aparece hasta pasados más de tres minutos de reproducción, justo al final del tema.'
      }
    ]
  },
  {
    id: 'retro_80s',
    name: '🕺 Clásicos 80s, Synth-Pop & Fiebre Disco',
    category: 'Retro 70s / 80s',
    description: 'Sintetizadores analógicos, bolas de espejos y líneas de bajo que definieron la era dorada del videoclip.',
    youtubeUrl: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn69On1f-8NAvX_CYlx7QyZc',
    playlistId: 'PL4fGSI1pDJn69On1f-8NAvX_CYlx7QyZc',
    badge: 'Clásicos',
    songs: [
      {
        id: 'billie_jean',
        title: 'Billie Jean',
        artist: 'Michael Jackson',
        genre: 'Post-Disco / Funk',
        year: 1982,
        audioSrc: 'assets/audio/billie_jean.wav',
        youtubeId: 'Zi_XLOBDo_Y',
        lyrics: {
          en: "Billie Jean is not my lover\nShe's just a girl who claims that I am the one\nBut the kid is not my son",
          es: "Billie Jean no es mi amante\nEs solo una chica que afirma que yo soy el único\nPero el niño no es mi hijo"
        },
        culturalTrivia: 'Perteneciente a "Thriller" (el álbum más vendido de la historia). Su videoclip rompió la barrera racial en MTV y fue la canción con la que Michael Jackson estrenó su legendario paso "Moonwalk" en 1983.'
      },
      {
        id: 'take_on_me',
        title: 'Take On Me',
        artist: 'a-ha',
        genre: 'Synth-pop',
        year: 1985,
        audioSrc: 'assets/audio/take_on_me.wav',
        youtubeId: 'djV11Xbc914',
        lyrics: {
          en: "Take on me, take me on\nI'll be gone\nIn a day or two",
          es: "acéptame, ponme a prueba\nMe habré ido\nEn un día o dos"
        },
        culturalTrivia: 'El grupo noruego a-ha revolucionó la historia de los vídeos musicales usando la técnica de rotoscopia (dibujo a lápiz cuadro por cuadro sobre imagen real). El vocalista Morten Harket alcanza un rango vocal de más de dos octavas y media en el estribillo.'
      },
      {
        id: 'stayin_alive',
        title: "Stayin' Alive",
        artist: 'Bee Gees',
        genre: 'Disco',
        year: 1977,
        audioSrc: 'assets/audio/stayin_alive.wav',
        youtubeId: 'I_izvAbhExY',
        lyrics: {
          en: "Whether you're a brother or whether you're a mother\nYou're stayin' alive, stayin' alive\nFeel the city breakin' and everybody shakin'",
          es: "Ya seas un hermano o ya seas una madre\nTe mantienes con vida, sobreviviendo\nSiente la ciudad romperse y a todo el mundo vibrar"
        },
        culturalTrivia: 'Con un tempo exacto de 103 pulsaciones por minuto (BPM), la Asociación Estadounidense del Corazón y los servicios médicos internacionales la utilizan oficialmente para entrenar el ritmo de las compresiones en maniobras de RCP.'
      },
      {
        id: 'every_breath_you_take',
        title: 'Every Breath You Take',
        artist: 'The Police',
        genre: 'New Wave / Soft Rock',
        year: 1983,
        audioSrc: 'assets/audio/billie_jean.wav',
        youtubeId: 'OMOGaugKpzs',
        lyrics: {
          en: "Every breath you take\nAnd every move you make\nEvery bond you break, every step you take\nI'll be watching you",
          es: "Cada respiro que tomes\nY cada movimiento que hagas\nCada lazo que rompas, cada paso que des\nTe estaré observando"
        },
        culturalTrivia: 'Escrita por Sting en Jamaica en el escritorio de Ian Fleming (creador de James Bond). Es considerada por BMI como la canción más reproducida en la historia de la radio mundial.'
      },
      {
        id: 'sweet_dreams',
        title: 'Sweet Dreams (Are Made of This)',
        artist: 'Eurythmics',
        genre: 'Synth-Pop / New Wave',
        year: 1983,
        audioSrc: 'assets/audio/blinding_lights.wav',
        youtubeId: 'qeMFqkcPYcg',
        lyrics: {
          en: "Sweet dreams are made of this\nWho am I to disagree?\nI travel the world and the seven seas\nEverybody's looking for something",
          es: "Los dulces sueños están hechos de esto\n¿Quién soy yo para estar en desacuerdo?\nViajo por el mundo y los siete mares\nTodo el mundo está buscando algo"
        },
        culturalTrivia: 'Annie Lennox y Dave Stewart grabaron esta obra maestra en un pequeño ático con un sintetizador secuenciador Oberheim OB-X justo después de haber roto su relación sentimental.'
      },
      {
        id: 'africa',
        title: 'Africa',
        artist: 'Toto',
        genre: 'Soft Rock / Yacht Rock',
        year: 1982,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: 'FTQbiNvZqaY',
        lyrics: {
          en: "I hear the drums echoing tonight\nBut she hears only whispers of some quiet conversation\nI bless the rains down in Africa",
          es: "Escucho los tambores resonando esta noche\nPero ella solo oye susurros de una conversación tranquila\nBendigo las lluvias allá en África"
        },
        culturalTrivia: 'En 2019, un artista instaló un sistema alimentado por energía solar en el desierto del Namib para que "Africa" de Toto suene en bucle por toda la eternidad.'
      }
    ]
  },
  {
    id: 'english_academy',
    name: '🎓 Inglés Pedagógico (Clear Vocals & Lyrics)',
    category: 'Educación Bilingüe',
    description: 'Canciones con pronunciación cristalina, tempos moderados y vocabulario rico para practicar Listening y Gramática.',
    youtubeUrl: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6O1LS0XSdF3RyO0Rq_LDeI',
    playlistId: 'PL4fGSI1pDJn6O1LS0XSdF3RyO0Rq_LDeI',
    badge: 'Ideal para Clase',
    songs: [
      {
        id: 'imagine',
        title: 'Imagine',
        artist: 'John Lennon',
        genre: 'Soft Rock / Piano Ballad',
        year: 1971,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'YkgkThdzX-8',
        lyrics: {
          en: "Imagine there's no heaven\nIt's easy if you try\nNo hell below us\nAbove us, only sky",
          es: "Imagina que no hay paraíso\nEs fácil si lo intentas\nNingún infierno debajo de nosotros\nArriba de nosotros, solo cielo"
        },
        culturalTrivia: 'Compuesta en un piano Steinway blanco en Tittenhurst Park. En 2017, Yoko Ono fue reconocida oficialmente como coautora de la canción por su influencia directa con su libro "Grapefruit".'
      },
      {
        id: 'someone_like_you',
        title: 'Someone Like You',
        artist: 'Adele',
        genre: 'Soul Ballad',
        year: 2011,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: 'hLQl3WQQoQ0',
        lyrics: {
          en: "Never mind, I'll find someone like you\nI wish nothing but the best for you, too\nDon't forget me, I beg\nI remember you said",
          es: "No importa, encontraré a alguien como tú\nNo te deseo nada más que lo mejor a ti también\nNo me olvides, te lo ruego\nRecuerdo lo que dijiste"
        },
        culturalTrivia: 'Fue la primera balada acompañada únicamente de piano y voz en llegar al número 1 de la lista Billboard Hot 100 en toda su historia.'
      },
      {
        id: 'yellow',
        title: 'Yellow',
        artist: 'Coldplay',
        genre: 'Alternative Rock / Britpop',
        year: 2000,
        audioSrc: 'assets/audio/take_on_me.wav',
        youtubeId: 'yKNxeF4KMsY',
        lyrics: {
          en: "Look at the stars\nLook how they shine for you\nAnd everything you do\nYeah, they were all yellow",
          es: "Mira las estrellas\nMira cómo brillan para ti\nY por todo lo que haces\nSí, todas eran amarillas"
        },
        culturalTrivia: 'Chris Martin encontró la palabra "Yellow" mirando la guía telefónica "Yellow Pages" (Páginas Amarillas) en el estudio de grabación en Gales tras salir a contemplar el cielo estrellado.'
      },
      {
        id: 'wonderwall',
        title: 'Wonderwall',
        artist: 'Oasis',
        genre: 'Britpop',
        year: 1995,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: 'bx1Bh8ZvH84',
        lyrics: {
          en: "Today is gonna be the day\nThat they're gonna throw it back to you\nBy now you should've somehow\nRealized what you gotta do",
          es: "Hoy va a ser el día\nEn que te lo van a devolver todo a ti\nA estas alturas ya deberías de algún modo\nHaberte dado cuenta de lo que tienes que hacer"
        },
        culturalTrivia: 'El título es un homenaje de Noel Gallagher a la banda sonora "Wonderwall Music" (1968), el primer álbum en solitario publicado por el ex-Beatle George Harrison.'
      },
      {
        id: 'perfect',
        title: 'Perfect',
        artist: 'Ed Sheeran',
        genre: 'Romantic Ballad',
        year: 2017,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: '2Vv-BfVoq4g',
        lyrics: {
          en: "I found a love for me\nDarling, just dive right in and follow my lead\nWell, I found a girl, beautiful and sweet",
          es: "Encontré un amor para mí\nCariño, simplemente sumérgete y sigue mis pasos\nBueno, encontré una chica, hermosa y dulce"
        },
        culturalTrivia: 'Dedicada a su esposa Cherry Seaborn, a quien conocía desde el instituto. Está escrita en compás de 12/8, el ritmo clásico de las baladas de soul de los años 50.'
      },
      {
        id: 'viva_la_vida',
        title: 'Viva La Vida',
        artist: 'Coldplay',
        genre: 'Baroque Pop',
        year: 2008,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'dvgZkm1xWPE',
        lyrics: {
          en: "I used to rule the world\nSeas would rise when I gave the word\nNow in the morning, I sleep alone\nSweep the streets I used to own",
          es: "Yo solía gobernar el mundo\nLos mares se alzaban cuando yo daba la orden\nAhora por la mañana duermo en soledad\nBarro las calles que antes me pertenecían"
        },
        culturalTrivia: 'El título está tomado de una naturaleza muerta de sandías pintada por la artista mexicana Frida Kahlo apenas ocho días antes de fallecer en 1954.'
      }
    ]
  },
  {
    id: 'millennial_90s_00s',
    name: '💿 Éxitos 90s & 2000s (Millennial Anthems)',
    category: '90s & 2000s',
    description: 'Los videoclips legendarios de la generación MTV: desde el pop coreografiado hasta el nu-metal y hip-hop.',
    youtubeUrl: 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn5rW2R03kM8h3yN4tX_7q9B',
    playlistId: 'PL4fGSI1pDJn5rW2R03kM8h3yN4tX_7q9B',
    badge: 'Nostalgia',
    songs: [
      {
        id: 'in_the_end',
        title: 'In the End',
        artist: 'Linkin Park',
        genre: 'Nu Metal / Alternative Rock',
        year: 2000,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: 'eVTXPUF4Oz4',
        lyrics: {
          en: "I tried so hard and got so far\nBut in the end, it doesn't even matter\nI had to fall to lose it all\nBut in the end, it doesn't even matter",
          es: "Lo intenté con tantas fuerzas y llegué tan lejos\nPero al final, ni siquiera importa\nTuve que caer para perderlo todo\nPero al final, ni siquiera importa"
        },
        culturalTrivia: 'Chester Bennington confesó que al principio no estaba convencido de incluirla en el álbum "Hybrid Theory", sin imaginar que se convertiría en la canción más exitosa de toda la carrera del grupo.'
      },
      {
        id: 'bad_romance',
        title: 'Bad Romance',
        artist: 'Lady Gaga',
        genre: 'Electropop / Dance',
        year: 2009,
        audioSrc: 'assets/audio/blinding_lights.wav',
        youtubeId: 'qrO4YZeyl0I',
        lyrics: {
          en: "I want your ugly, I want your disease\nI want your everything as long as it's free\nI want your love\nLove, love, love, I want your love",
          es: "Quiero tu fealdad, quiero tu locura\nQuiero todo de ti mientras sea libre\nQuiero tu amor\nAmor, amor, amor, quiero tu amor"
        },
        culturalTrivia: 'Contiene referencias directas a las películas de suspense de Alfred Hitchcock ("Psicosis", "Vértigo" y "La ventana indiscreta") y un puente cantado en francés.'
      },
      {
        id: 'i_want_it_that_way',
        title: 'I Want It That Way',
        artist: 'Backstreet Boys',
        genre: 'Teen Pop',
        year: 1999,
        audioSrc: 'assets/audio/shape_of_you.wav',
        youtubeId: '4fndeDfaWCg',
        lyrics: {
          en: "You are my fire\nThe one desire\nBelieve when I say\nI want it that way",
          es: "Tú eres mi fuego\nMi único deseo\nCréeme cuando te digo\nQue lo quiero de esa manera"
        },
        culturalTrivia: 'Escrita en Estocolmo por el legendario productor sueco Max Martin. Su letra deliberadamente ambigua fue clave para su impacto emocional universal.'
      },
      {
        id: 'lose_yourself',
        title: 'Lose Yourself',
        artist: 'Eminem',
        genre: 'Hip-Hop / Rap',
        year: 2002,
        audioSrc: 'assets/audio/billie_jean.wav',
        youtubeId: '_Yhyp-_hX2s',
        lyrics: {
          en: "Look, if you had one shot, or one opportunity\nTo seize everything you ever wanted, in one moment\nWould you capture it, or just let it slip?",
          es: "Mira, si tuvieras un solo disparo, o una sola oportunidad\nPara conseguir todo lo que siempre quisiste, en un instante\n¿La atraparías o simplemente la dejarías escapar?"
        },
        culturalTrivia: 'Eminem escribió los versos en hojas sueltas durante los descansos del rodaje de la película "8 Mile". Se convirtió en la primera canción de rap en ganar el Premio Óscar a la Mejor Canción Original.'
      },
      {
        id: 'firework',
        title: 'Firework',
        artist: 'Katy Perry',
        genre: 'Dance-Pop',
        year: 2010,
        audioSrc: 'assets/audio/stayin_alive.wav',
        youtubeId: 'QGJuMBdaqIw',
        lyrics: {
          en: "Do you ever feel like a plastic bag\nDrifting through the wind, wanting to start again?\nBaby, you're a firework\nCome on, show 'em what you're worth",
          es: "¿Alguna vez te has sentido como una bolsa de plástico\nFlotando en el viento, queriendo empezar de nuevo?\nCariño, tú eres un fuego artificial\nVamos, demuéstrales lo que vales"
        },
        culturalTrivia: 'Inspirada en un pasaje de la novela "En el camino" (On the Road) de Jack Kerouac, que describe a las personas llenas de vida que brillan y explotan como fuegos artificiales en la noche.'
      },
      {
        id: 'zombie',
        title: 'Zombie',
        artist: 'The Cranberries',
        genre: 'Alternative Rock / Grunge',
        year: 1994,
        audioSrc: 'assets/audio/bohemian_rhapsody.wav',
        youtubeId: '6Ejga4kJUts',
        lyrics: {
          en: "Another head hangs lowly\nChild is slowly taken\nAnd the violence caused such silence\nWho are we mistaken?",
          es: "Otra cabeza cuelga cabizbaja\nUn niño es arrebatado lentamente\nY la violencia causó tanto silencio\n¿En quién nos hemos equivocado?"
        },
        culturalTrivia: 'Compuesta por Dolores O’Riordan como grito pacifista de protesta tras los atentados de Warrington de 1993. Fue el primer videoclip de una banda irlandesa en superar los mil millones de visitas en YouTube.'
      }
    ]
  }
];

/**
 * Mapa indexado de todas las canciones conocidas para enriquecer automáticamente
 * cualquier importación externa con letras bilingües y trivia si coincide su ID o título.
 */
export const ENRICHED_SONGS_MAP = new Map();
THEMATIC_PLAYLISTS.forEach(pl => {
  pl.songs.forEach(song => {
    ENRICHED_SONGS_MAP.set(song.youtubeId, song);
    ENRICHED_SONGS_MAP.set(song.title.toLowerCase(), song);
  });
});
