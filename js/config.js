/* ============================================================
   CONFIGURACIÓN DE LA APP  —  edita SOLO este archivo
   (lo usan tanto la app como el service worker de notificaciones)
   ============================================================ */
self.APP_CONFIG = {
  // Nombre que se ve en la app
  teamName: "Junior DHF",

  // 1) Pega aquí la configuración de tu app web de Firebase
  //    (Consola Firebase → Configuración del proyecto → Tus apps → SDK config)
  //    Si lo dejas vacío, la app arranca en MODO DEMO con datos inventados.
  firebase: {
    apiKey: "AIzaSyC6BYnTaNNLkgnAZk9zJyMloLdTxCJ3NEc",
    authDomain: "wellness-dhf.firebaseapp.com",
    projectId: "wellness-dhf",
    storageBucket: "wellness-dhf.firebasestorage.app",
    messagingSenderId: "477123362386",
    appId: "1:477123362386:web:b8bc46ce52b7740282e98b"
  },

  // 2) Clave pública VAPID (Cloud Messaging → Certificados push web)
  vapidKey: "BJLMD8dR5F-nQlTxQdMpcaoR5NqviQTrbLziYowPehp-sds_x9zC3-FFy9M_lXhZmpXZn-iOv-n5y4SHCqgLw-g",

  // 3) Plantilla: las jugadoras eligen su nombre al registrarse
  roster: [
    "Amy Van den Bosch", "Anna Gardsjord", "Anna Serrahima", "Berta Serrahima",
    "Blanca Orsola", "Candela Bujosa Monclús", "Carlota Duran", "Clara Pérez",
    "Clara Rodríguez Setó", "Clàudia Gómez Barceló", "Cristina Torres", "Emma Caldas",
    "Gabriela Perez Mimendez", "Ivet Martí", "Laia Vidosa i Artigas", "Maria Gesti",
    "Maria Vidal", "Maria Vilumara", "Mariona Serrahima", "Marta Alcaraz Galy",
    "Marta Lamoglia", "Martina Diaz", "Mireia Gifra", "Mònica Hernàndez", "Tere Lima"
  ]
};
