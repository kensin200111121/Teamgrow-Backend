const jwt = require('jsonwebtoken');
const api = require('../src/configs/api');
const {
  createToken,
  getAllTokens,
  deleteAllTokens,
  updateTokenById,
  getTokenById,
  deleteTokenById,
} = require('../src/services/identity');

const checkAuth = async (token) => {
  const APP_JWT_SECRET = 'FB8DC8246A2499A7A9CF47D3C986F';
  let decoded;
  try {
    decoded = jwt.verify(token, APP_JWT_SECRET);
  } catch (err) {
    console.log('check verify error', err.message || err.msg);
    return;
  }

  if (!decoded) {
    console.log('Authorization decode failed');
    return;
  }
  console.log('decode info', decoded);
};
// decode info {
//     id: '64aef9d778c3d10e1b244319',
//     vortexUserId: 2435283,
//     uuid: 'ab9155fa-fccd-4d2c-9b5a-4653fa504d3b',
//     adminId: null,
//     iat: 1708959151
//   }
const userId = '2435283';
const bearerToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0YWVmOWQ3NzhjM2QxMGUxYjI0NDMxOSIsInZvcnRleFVzZXJJZCI6MjQzNTI4MywidXVpZCI6ImFiOTE1NWZhLWZjY2QtNGQyYy05YjVhLTQ2NTNmYTUwNGQzYiIsImFkbWluSWQiOm51bGwsImlhdCI6MTcwODk1OTE1MX0.oM7qdSu8O1_YHjhkqEIKkCr5HWAVi1ZqDGcmepL7zdI';

// checkAuth('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0YWVmOWQ3NzhjM2QxMGUxYjI0NDMxOSIsInZvcnRleFVzZXJJZCI6MjQzNTI4MywidXVpZCI6ImFiOTE1NWZhLWZjY2QtNGQyYy05YjVhLTQ2NTNmYTUwNGQzYiIsImFkbWluSWQiOm51bGwsImlhdCI6MTcwODk1OTE1MX0.oM7qdSu8O1_YHjhkqEIKkCr5HWAVi1ZqDGcmepL7zdI');
// createToken({
//   userId,
//   bearerToken,
//   body: {
//     account: "rui@crmgrow.com",
//     provider: "google",
//     scopes: [
//       "https://www.googleapis.com/auth/userinfo.profile",
//       "https://www.googleapis.com/auth/userinfo.email"
//     ],
//     credentials: {
//       access_token: "ya29.a0AfH6SMD8...example...8zRQ",
//       token_type: "Bearer",
//       expires_in: 3599,
//       refresh_token: "1//0g...example...gW",
//       scope: [
//         "https://www.googleapis.com/auth/userinfo.profile",
//         "https://www.googleapis.com/auth/userinfo.email"
//       ]
//     }
//   }
// });
// getAllTokens({ userId, bearerToken });
// deleteAllTokens({ userId, bearerToken, body: {"account": "rui@crmgrow.com", "provider": "google"} });
// updateTokenById({ userId, bearerToken, tokenId: 54, body:   {
//   "scopes": [
//     "https://www.googleapis.com/auth/userinfo.profile",
//     "https://www.googleapis.com/auth/userinfo.email"
//   ],
//   "credentials": {
//     "access_token": "ya30.a0AfH6SMD8...example...8zRQ",
//     "token_type": "Bearer",
//     "expires_in": 3599,
//     "refresh_token": "1//0g...example...gW",
//     "scope": [
//       "https://www.googleapis.com/auth/userinfo.profile",
//       "https://www.googleapis.com/auth/userinfo.email"
//     ]
//   },
//   "error": "OAuth token expired, need to re-auth with user"
// } });

// getTokenById({ userId, bearerToken, tokenId: 54});
// deleteTokenById({ userId, bearerToken, tokenId: 54, body: {"account": "rui@crmgrow.com", "provider": "google"}});
