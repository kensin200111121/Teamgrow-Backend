// test-setup.js
const mongoose = require('mongoose');
const { DB_TEST_PORT } = require('../src/configs/database');

mongoose.promise = global.Promise;

// async function removeAllCollections() {
//   const collections = Object.keys(mongoose.connection.collections);
//   for (const collectionName of collections) {
//     const collection = mongoose.connection.collections[collectionName];
//     await collection.deleteMany();
//   }
// }

// async function dropAllCollections() {
//   const collections = Object.keys(mongoose.connection.collections);
//   for (const collectionName of collections) {
//     const collection = mongoose.connection.collections[collectionName];
//     try {
//       await collection.drop();
//     } catch (error) {
//       // Sometimes this error happens, but you can safely ignore it
//       if (error.message === 'ns not found') return;
//       // This error occurs when you use it.todo. You can
//       // safely ignore this error too
//       if (error.message.includes('a background operation is currently running'))
//         return;
//       console.log(error.message);
//     }
//   }
// }

module.exports = {
  setupDB() {
    // Connect to Mongoose
    beforeAll(async () => {
      mongoose.set('strictQuery', false);
      const url = DB_TEST_PORT;
      await mongoose.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    });

    // Cleans up database between each test
    afterEach(async () => {
      // To Do Something
      // await removeAllCollections();
    });

    // Disconnect Mongoose
    afterAll(async () => {
      // To Do Something
      // await dropAllCollections();
      // await mongoose.connection.close();
    });
  },

  async insertOrUpdate(Model, data) {
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };
    const result = await Model.findOneAndUpdate(
      data.query,
      data.update,
      options
    );
    return result;
  },
};
