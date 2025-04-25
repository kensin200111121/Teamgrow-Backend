const { default: mongoose } = require('mongoose');

module.exports = {
  async up(db, client) {
    const badLabels = await db
      .collection('labels')
      .aggregate([
        {
          $match: { name: { $exists: true } },
        },
        {
          $match: {
            $expr: { $eq: [{ $strLenCP: '$name' }, 24] },
            name: { $regex: /^[a-z0-9_.-]*$/ },
          },
        },
      ])
      .toArray();
    for (let i = 0; i < badLabels.length; i++) {
      const badLabel = badLabels[i];
      console.log('bad label data -----> ', i, badLabel);
      const label = await db.collection('labels').findOne({
        _id: mongoose.Types.ObjectId(badLabels[i].name),
      });
      console.log('found the same label', label);
      if (label) {
        if (label.role === 'admin') {
          console.log('admin label -> delete one and update all of them');
          await db.collection('labels').deleteOne({
            _id: badLabels[i]._id,
          });
          await db
            .collection('contacts')
            .updateMany(
              { label: badLabels[i]._id },
              { $set: { label: label._id } }
            )
            .then((_result) => {
              console.log('result of update', _result);
            });
        } else {
          if (badLabel.user + '' === label.user + '') {
            console.log('It is generating from own user labels ----> ');
            await db.collection('labels').deleteOne({
              _id: badLabels[i]._id,
            });
            await db
              .collection('contacts')
              .updateMany(
                { label: badLabels[i]._id },
                { $set: { label: label._id } }
              )
              .then((_result) => {
                console.log('result of update', _result);
              });
          } else {
            const userOwnLabel = await db
              .collection('labels')
              .findOne({ user: badLabel.user, name: label.name });
            console.log(
              'try to find the label with same name ----> ',
              userOwnLabel
            );

            if (userOwnLabel) {
              console.log(
                'generated from own user -> remove and update the contacts'
              );
              await db.collection('labels').deleteOne({
                _id: badLabels[i]._id,
              });
              await db
                .collection('contacts')
                .updateMany(
                  { label: badLabels[i]._id },
                  { $set: { label: userOwnLabel._id } }
                );
            } else {
              console.log('generated from other user -> update the name');
              await db.collection('labels').updateOne(
                {
                  _id: badLabels[i]._id,
                },
                { $set: { name: label.name } }
              );
            }
          }
        }
      }
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
