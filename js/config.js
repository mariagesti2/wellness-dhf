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
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  // 2) Clave pública VAPID (Cloud Messaging → Certificados push web)
  vapidKey: "",

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
