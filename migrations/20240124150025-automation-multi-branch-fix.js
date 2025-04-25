const getChildInfo = (automations, parentId, result) => {
  const child = automations.filter((e) => e.parent === parentId);
  if (child?.length) {
    child.forEach((e) => {
      result.childCnt++;
      getChildInfo(automations, e.id, result);
    });
  } else {
    result.childId = parentId;
  }
};

module.exports = {
  async up(db, client) {
    // TODO write your migration here.
    // See https://github.com/seppevs/migrate-mongo/#creating-a-new-migration-script
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: true}});
    const autos = await db
      .collection('automations')
      .aggregate(
        [
          { $match: {} },
          { $unwind: '$automations' },
          {
            $group: {
              _id: '$_id',
              parent_refs: {
                $push: {
                  $cond: {
                    if: '$automations.condition',
                    then: null,
                    else: '$automations.parent',
                  },
                },
              },
            },
          },
          { $unwind: '$parent_refs' },
          { $match: { parent_refs: { $ne: null } } },
          {
            $group: {
              _id: {
                automation: '$_id',
                parent: '$parent_refs',
              },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gte: 2 } } },
        ],
        { allowDiskUse: true }
      )
      .toArray();

    if (!autos?.length) return;
    for (let i = 0; i < autos.length; i++) {
      const aId = autos[i]._id.automation;
      const aPrent = autos[i]._id.parent;
      const auto = await db.collection('automations').findOne({ _id: aId });
      console.log('----auto find result', auto?._id);
      if (!auto) continue;
      if (!auto?.automations?.length) continue;
      const mainIds = [];
      const automations = auto.automations;
      automations.forEach((e) => {
        if (e.parent === aPrent) {
          mainIds.push(e.id);
        }
      });
      console.log('mainIds', mainIds);
      if (mainIds?.length !== 2) continue;
      const result = [];
      mainIds.forEach((e) => {
        const res = { parent: e, childCnt: 1, childId: e };
        result.push(res);
        getChildInfo(automations, e, res);
      });
      console.log('all result', result);
      const newNodeInfo = { id: null, parent: null };
      if (result[0].childCnt <= result[1].childCnt) {
        newNodeInfo.id = result[1].parent;
        newNodeInfo.parent = result[0].childId;
      } else {
        newNodeInfo.id = result[0].parent;
        newNodeInfo.parent = result[1].childId;
      }
      console.log('newNodeInfo', newNodeInfo);
      const newAutomations = automations.map((e) => {
        if (e.id === newNodeInfo.id) e.parent = newNodeInfo.parent;
        return e;
      });
      await db
        .collection('automations')
        .updateOne(
          { _id: aId },
          {
            $set: { automations: newAutomations },
          }
        )
        .catch((err) => {
          console.log('err', err.message);
        });
    }
  },

  async down(db, client) {
    // TODO write the statements to rollback your migration (if possible)
    // Example:
    // await db.collection('albums').updateOne({artist: 'The Beatles'}, {$set: {blacklisted: false}});
  },
};
