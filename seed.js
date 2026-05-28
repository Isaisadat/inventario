require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado a MongoDB');

    const users = [
      {
        username: 'fernanda',
        password: 'ferisa02',
        nombre: 'Fernanda',
        rol: 'fleure'
      },
      {
        username: 'isai',
        password: 'ferisa02',
        nombre: 'Isaí',
        rol: 'maquillaje'
      }
    ];

    for (const userData of users) {
      const existing = await User.findOne({ username: userData.username });
      if (existing) {
        console.log(`Usuario ${userData.username} ya existe, actualizando contraseña...`);
        existing.password = userData.password;
        existing.nombre = userData.nombre;
        existing.rol = userData.rol;
        await existing.save();
      } else {
        const user = new User(userData);
        await user.save();
        console.log(`Usuario ${userData.username} creado`);
      }
    }

    console.log('Seed completado exitosamente');
    process.exit(0);
  } catch (err) {
    console.error('Error en seed:', err);
    process.exit(1);
  }
}

seed();
