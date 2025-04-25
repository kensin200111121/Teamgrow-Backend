const {
  login,
  signUp,
  signUpMobile,
  getMe,
  resetPasswordByCode,
  forgotPassword,
  disableAccount,
  sleepAccount,
  newSubAccount,
  signUpGmail,
  signUpOutlook,
  socialGmail,
  socialOutlook,
  appSocial,
  appSocialCallback,
  appSocialRegister,
} = require('../user');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const mockingoose = require('mockingoose');
const { Stripe } = require('stripe');
const httpMocks = require('jest-mock-req-res');
const { AuthorizationCode } = require('simple-oauth2');
const {
  login_req,
  new_user_req,
  change_pwd_req,
  forgot_pwd_req,
  disable_user_req,
  social_req,
} = require('../../../__tests__/__mocks__/request/user');
const User = require('../../models/user');
const Guest = require('../../models/guest');
const Garbage = require('../../models/garbage');
const Payment = require('../../models/payment');
const {
  gmail_user,
  outlook_user,
  create_user_data,
} = require('../../../__tests__/__mocks__/data/user');
const { guest_user } = require('../../../__tests__/__mocks__/data/guest');
const {
  email_user_garbage: garbage_data,
} = require('../../../__tests__/__mocks__/data/garbage');
const { payment_data } = require('../../../__tests__/__mocks__/data/payment');

const { mockRequest, mockResponse } = httpMocks;

const {
  missed_email_req,
  invalid_user_req,
  invalid_password_req,
  social_login_req,
  correct_user_req,
} = login_req;

jest.mock('crypto', () => ({
  pbkdf2Sync: jest.fn().mockImplementation((password) => Buffer.from(password)),
  randomBytes: jest.fn().mockImplementation((num) => num.toString()),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mockup_jsonwebtoken'),
}));

jest.mock('googleapis');
jest.mock('simple-oauth2', () => ({
  AuthorizationCode: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({
      token: {
        refresh_token: 'mock_refresh_token',
        id_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Mjk3NTgzMzF9.6S4UCrqufPjhN6A3AQ8ewHrL0TqGtgj6zQAiUZmTanc',
      },
    }),
    authorizeURL: jest.fn(() => 'mocked-authorization-uri'),
  })),
}));
jest.mock('twilio', () => {
  const create = jest.fn().mockResolvedValue({ sid: 'mocked-sid' });
  return jest.fn(() => ({
    messages: { create },
  }));
});

jest.mock('../../helpers/user', () => ({
  userProfileOutputGuard: jest.fn(),
  saveVersionInfo: jest.fn(),
  saveDeviceToken: jest.fn(),
  createUser: jest.fn(() =>
    Promise.resolve({ status: true, data: 'created_new_user' })
  ),
  checkIdentityTokens: jest.fn(),
  suspendUser: jest.fn(() => Promise.resolve(true)),
  disableUser: jest.fn(() => Promise.resolve(true)),
  suspendData: jest.fn(() => Promise.resolve(true)),
  sleepUser: jest.fn(() => Promise.resolve(true)),
  createInternalTeam: jest.fn(() => Promise.resolve(true)),
  promocodeCheck: jest.fn(),
  getUserOrganization: jest.fn(),
  checkRecaptchaToken: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../../helpers/payment', () => ({
  create: jest.fn(() => Promise.resolve({ payment: { id: 123 } })),
  updateSubscription: jest.fn().mockImplementation(async (data) => {
    if (data.payement_id.toString() === '6664066b13b19456b9c5cbcd') {
      Promise.resolve(true);
    } else {
      Promise.reject();
    }
  }),
  createSubscription: jest.fn(() => Promise.resolve({ payment: { id: 123 } })),
}));
jest.mock('../../helpers/notification', () => ({
  sendNotificationEmail: jest.fn(),
}));
jest.mock('../../services/message', () => ({
  deleteWavvUser: jest.fn(),
}));

jest.mock('randomstring', () => {
  return {
    generate: jest.fn(() => '123456'),
  };
});

const httpMocks2 = require('node-mocks-http');
const { once, EventEmitter } = require('events');

const retrieveSubscriptions = jest.fn(() => Promise.resolve({ id: 123 }));
Stripe.prototype.subscriptions = {
  retrieve: retrieveSubscriptions,
};

jest.mock('../../models/user');
jest.mock('../../models/guest');
jest.mock('../../models/garbage');
jest.mock('../../models/folder');
jest.mock('../../models/team');
jest.mock('../../models/contact');
jest.mock('../../models/activity');
jest.mock('../../models/payment');

describe('user', () => {
  // default timeout value is 5s, so we should increase it more big (90s)
  jest.setTimeout(30 * 1000);

  beforeEach(async () => {
    const mockUserInfo = {
      userinfo: {
        v2: {
          me: {
            get: jest.fn().mockImplementation((callback) => {
              callback(null, { data: { id: 'socialId' } });
            }),
          },
        },
      },
    };
    google.oauth2.mockImplementation(() => mockUserInfo);

    const mockAuth = {
      generateAuthUrl: jest.fn().mockReturnValue('mock_google_auth_url'),
      getToken: jest.fn().mockResolvedValue({
        tokens: {
          refresh_token: 'mock_refresh_token',
          access_token: 'mock_access_token',
        },
      }),
      setCredentials: jest.fn(),
    };

    google.auth = jest.fn().mockImplementation(() => mockAuth);
    google.auth.OAuth2 = jest.fn().mockImplementation(() => mockAuth);
  });
  /**
   * =========== login =============
   *  */
  describe('login', () => {
    let req;
    let res;
    // Seed the database with users
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
      User.findOne.mockResolvedValue(gmail_user);
      Guest.findOne.mockResolvedValue(guest_user);
      User.updateOne.mockResolvedValue(() => {
        return Promise.resolve();
      });
    });

    it('should success log in', async () => {
      req.body = correct_user_req;
      await login(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
      expect(response.data.token).toBeDefined();
      expect(response.data.user).toBeDefined();
    });

    it('should send missing_email_user_name error', async () => {
      User.findOne.mockResolvedValue(null);
      req.body = missed_email_req;
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'missing_email_user_name',
      });
    });

    it('should send eamil doesn`t exist message', async () => {
      User.findOne.mockResolvedValue(null);
      Guest.findOne.mockResolvedValue(null);
      req.body = invalid_user_req;
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'User Email doesn`t exist',
      });
    });

    it('should send error Invalid password', async () => {
      req.body = invalid_password_req;
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Invalid email or password!',
      });
    });

    it('should send error loggin with social and social_id', async () => {
      const no_salt_user = { ...gmail_user };
      delete no_salt_user.salt;
      User.findOne.mockResolvedValue(no_salt_user);
      req.body = social_login_req;
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should send error loggin with social and no social_id', async () => {
      const no_salt_user = { ...gmail_user };
      delete no_salt_user.salt;
      delete no_salt_user.social_id;
      User.findOne.mockResolvedValue(no_salt_user);
      req.body = social_login_req;
      await login(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Please try to loggin using social email loggin',
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== signup =============
   *  */
  describe('signup', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
      User.findOne.mockResolvedValue(gmail_user);
      Guest.findOne.mockResolvedValue(guest_user);
    });

    it('should send message User already exist', async () => {
      req.body = new_user_req;
      await signUp(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'User already exists',
      });
    });

    it('should create user successfully', async () => {
      User.findOne.mockResolvedValue(null);
      req.body.captchaToken = true;
      await signUp(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: 'created_new_user',
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== signUpMobile =============
   *  */
  describe('signUpMobile', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
      User.findOne.mockResolvedValue(gmail_user);
      Guest.findOne.mockResolvedValue(guest_user);
    });

    it('should send message User already exist', async () => {
      req.body = new_user_req;
      await signUpMobile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'User already exists',
      });
    });

    it('should create user successfully', async () => {
      User.findOne.mockResolvedValue(null);
      req.body = new_user_req;
      await signUpMobile(req, res);
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: 'created_new_user',
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== getMe =============
   *  */
  describe('getMe', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
      User.findOne.mockResolvedValue(gmail_user);
      Guest.findOne.mockResolvedValue(guest_user);
      Garbage.findOne.mockResolvedValue(garbage_data);
    });

    it('should get user info successfully', async () => {
      req.currentUser = new_user_req;
      await getMe(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== resetPasswordByCode =============
   *  */
  describe('resetPasswordByCode', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = change_pwd_req;
      mockingoose.resetAll();
    });

    it('should failed reset password because of user not existed', async () => {
      User.findOne.mockResolvedValue(null);
      await resetPasswordByCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'NO user exist',
      });
    });

    it('should failed reset password because of no user salt', async () => {
      const user = { ...gmail_user };
      delete user.salt;
      User.findOne.mockResolvedValue(user);
      await resetPasswordByCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'You must use social login',
      });
    });

    it('should failed reset password because of invalid user salt', async () => {
      const user = { ...gmail_user };
      User.findOne.mockResolvedValue(user);
      await resetPasswordByCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'invalid_code',
      });
    });

    it('should failed reset password because of expired code', async () => {
      const user = { ...gmail_user };
      user.salt = 'salt 123456';
      user.updated_at = new Date() - 1000 * 60 * 16;
      User.findOne.mockResolvedValue(user);
      await resetPasswordByCode(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'expired_code',
      });
    });

    it('should reset password successfully', async () => {
      const user = { ...gmail_user };
      user.salt = 'salt 123456';
      user.updated_at = new Date();
      User.findOne.mockResolvedValue(user);
      await resetPasswordByCode(req, res);
      const response = res.send.mock.calls[0][0];
      expect(res.send).toHaveBeenCalled();
      expect(response.status).toBeTruthy();
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== forgotPassword =============
   *  */
  describe('forgotPassword', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = forgot_pwd_req;
      mockingoose.resetAll();
    });

    it('should failed because user not existed', async () => {
      req.body = {};
      await forgotPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
        error: 'no_email_or_user_name',
      });
    });

    it('should failed because req email is not', async () => {
      User.findOne.mockResolvedValue(null);
      await forgotPassword(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'no_user',
      });
    });

    it('should success', async () => {
      User.findOne.mockResolvedValue(gmail_user);
      await forgotPassword(req, res);
      expect(res.send).toHaveBeenCalled();
      const response = res.send.mock.calls[0][0];
      expect(response.status).toBeTruthy();
    });
    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== disableAccount =============
   *  */
  describe('disableAccount', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = disable_user_req;
      req.currentUser = gmail_user;
      mockingoose.resetAll();
    });

    it('should failed because sub accounts existed', async () => {
      User.find.mockResolvedValue([outlook_user]);
      await disableAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'remove_subaccount',
      });
    });

    it('should failed because sub accounts existed', async () => {
      User.find.mockResolvedValue([]);
      User.findOne.mockResolvedValue(null);
      Payment.findOne.mockResolvedValue(null);
      await disableAccount(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== sleepAccount =============
   *  */
  describe('sleepAccount', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = disable_user_req;
      req.currentUser = gmail_user;
      mockingoose.resetAll();
      User.updateOne.mockResolvedValue(() => {
        return Promise.resolve();
      });
    });

    it('should failed by failed payment', async () => {
      Payment.findOne.mockResolvedValue(null);
      await sleepAccount(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'create subscription error',
      });
    });

    it('should success for sleep account', async () => {
      await sleepAccount(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== newSubAccount =============
   *  */
  describe('newSubAccount', () => {
    // Seed the database with users
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      req.body = create_user_data;
      req.currentUser = gmail_user;
      mockingoose.resetAll();
      User.findOne.mockResolvedValue(gmail_user);
    });

    it('should failed because no primary account', async () => {
      const user = { ...req.currentUser };
      user.is_primary = false;
      req.currentUser = user;
      await newSubAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Please create account in primary',
      });
    });

    it('should failed because of card not connected', async () => {
      const user = { ...req.currentUser };
      user.subscription.is_limit = true;
      user.payment = null;
      req.currentUser = user;
      await newSubAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Please connect your card',
      });
    });

    it('should failed because user already existed', async () => {
      await newSubAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'User already exists',
      });
    });

    it('should failed because of no have permssion', async () => {
      const user = JSON.parse(JSON.stringify(gmail_user));
      user.organization_info.is_enabled = false;
      req.currentUser = user;
      await newSubAccount(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: "You don't have permission to create new sub account",
      });
    });

    it('should success for creation of new sub account', async () => {
      User.findOne.mockResolvedValue(null);
      Payment.findOne.mockResolvedValue(payment_data);
      await newSubAccount(req, res);
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: 'created_new_user',
      });
    });

    afterEach(async () => {
      jest.clearAllMocks();
    });
  });

  /**
   * =========== signUpGmail =============
   *  */
  describe('signUpGmail', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
    });

    it('should failed because of  Client doesn`t exist', async () => {
      google.auth.OAuth2.mockImplementationOnce(() => {
        return {
          generateAuthUrl: jest.fn().mockReturnValue(null),
        };
      });
      await signUpGmail(req, res);
      expect(res.status).toBeTruthy();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Client doesn`t exist',
      });
    });

    it('should success for signup gmail', async () => {
      await signUpGmail(req, res);
      // console.log(' Success Signup Gmail ');
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(String),
      });
    });

    afterEach(async () => {
      jest.clearAllMocks();
    });
  });

  /**
   * =========== signUpOutlook =============
   *  */
  describe('signUpOutlook', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest();
      res = mockResponse();
      mockingoose.resetAll();
    });

    it('should success for signup outlook', async () => {
      await signUpOutlook(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(String),
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== socialGmail =============
   *  */
  describe('socialGmail', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      mockingoose.resetAll();
      res = mockResponse();
    });

    it('should success for social gmail', async () => {
      req = mockRequest({
        query: social_req,
      });
      await socialGmail(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
    });

    it('should return 403 if no refresh_token', async () => {
      google.auth.OAuth2.mockImplementationOnce(() => {
        return {
          getToken: jest.fn().mockResolvedValue({
            tokens: {},
          }),
          setCredentials: jest.fn(),
        };
      });

      req = mockRequest({
        query: social_req,
      });

      await socialGmail(req, res);
      expect(res.status).toBeTruthy();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith({
        status: false,
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });

  /**
   * =========== socialOutlook =============
   *  */
  describe('socialOutlook', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      res = mockResponse();
      mockingoose.resetAll();
    });

    it('should success for social outlook', async () => {
      req = mockRequest({
        query: {
          code: 'valid_code',
        },
      });

      const mockToken = {
        token: {
          refresh_token: 'mock_refresh_token',
          id_token: 'mock.id.token',
        },
      };

      const decodedToken = {
        preferred_username: 'test@outlook.com',
        oid: 'mock_oid',
      };

      // Mock the getToken method
      const oauth2Client = new AuthorizationCode();
      oauth2Client.getToken.mockResolvedValue(mockToken);

      // Mock Buffer.from for decoding the token
      jest.spyOn(Buffer, 'from').mockImplementation((data, encoding) => {
        if (encoding === 'base64') {
          return {
            toString: () => JSON.stringify(decodedToken),
          };
        }
        return Buffer.from(data);
      });
      await socialOutlook(req, res);
      expect(res.status).toBeTruthy();
      expect(res.send).toHaveBeenCalledWith({
        status: true,
        data: expect.any(Object),
      });
    });

    afterEach(async () => {
      // To Do Something
    });
  });
  /**
   * =========== appSocial =============
   *  */

  describe('appSocial', () => {
    let req;
    let res;
    beforeEach(async () => {
      jest.clearAllMocks();
      req = mockRequest({
        params: {
          social: 'google',
          source: null,
        },
      });
      res = mockResponse();
      mockingoose.resetAll();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should generate Google authorization URL', async () => {
      await appSocial(req, res);
      expect(res.render).toHaveBeenCalledWith('social_oauth', {
        url: 'mock_google_auth_url',
      });
    });

    it('should failed with Client doesn`t exist', async () => {
      const mockAuth = {
        generateAuthUrl: jest.fn().mockReturnValue(null),
      };

      google.auth.OAuth2 = jest.fn().mockImplementation(() => mockAuth);
      await appSocial(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Client doesn`t exist',
      });
    });

    it('should generate Outlook authorization URL', async () => {
      req = {
        params: {
          social: 'outlook',
          source: null,
        },
      };

      await appSocial(req, res);
      expect(res.render).toHaveBeenCalledWith('social_oauth', {
        url: 'mocked-authorization-uri',
      });
    });
  });
  /**
   * =========== appSocialCallback =============
   *  */
  describe('appSocialCallback', () => {
    let req;
    let res;
    let resSendSpy;
    beforeEach(() => {
      req = httpMocks2.createRequest({
        params: {
          social: '',
          source: '',
        },
        query: {
          code: 'mockCode',
        },
      });
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
      resSendSpy = jest.spyOn(res, 'render');
      User.findOne.mockResolvedValue(gmail_user);
    });

    it('should handle Google authentication successfully', async () => {
      req.params.social = 'google';
      req.params.source = 'testSource';
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialCallback(req, res);
      await responseEndPromise; //
      expect(resSendSpy).toBeTruthy();
      expect(res.render).toHaveBeenCalledWith('social_oauth_callback', {
        status: true,
        data: expect.any(Object),
        source: expect.any(String),
      });
    });

    it('should handle Google authentication error when no refresh token', async () => {
      req.params.social = 'google';

      const mockTokens = {};

      google.auth.OAuth2.mockImplementation(() => ({
        getToken: jest.fn().mockResolvedValue({ tokens: mockTokens }),
        setCredentials: jest.fn(),
      }));
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialCallback(req, res);
      await responseEndPromise; //

      expect(res.render).toHaveBeenCalledWith('social_oauth_callback', {
        status: false,
        error: 'Refresh Token is not gained.',
      });
    });

    it('should handle Outlook authentication successfully', async () => {
      req.params.social = 'outlook';
      req.params.source = 'testSource';

      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialCallback(req, res);
      await responseEndPromise; //
      expect(res.render).toHaveBeenCalledWith('social_oauth_callback', {
        status: true,
        data: expect.any(Object),
        source: expect.any(String),
      });
    });

    it('should handle case when user is not found', async () => {
      req.params.social = 'outlook';
      req.params.source = 'testSource';

      User.findOne.mockResolvedValue(null);
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialCallback(req, res);
      await responseEndPromise; //

      expect(res.render).toHaveBeenCalledWith('social_oauth_callback', {
        status: false,
        error: `No existing email or user.`,
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });
  });

  /**
   * =========== appSocialRegister =============
   *  */
  describe('appSocialRegister', () => {
    let req;
    let res;
    let resSendSpy;
    beforeEach(() => {
      req = httpMocks2.createRequest({
        params: {
          social: '',
          source: '',
        },
        query: {
          code: 'mockCode',
        },
      });
      res = httpMocks2.createResponse({ eventEmitter: EventEmitter }); // pass the event emitter
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should handle Google sign-up', async () => {
      resSendSpy = jest.spyOn(res, 'render');
      req.params.social = 'google';
      req.params.source = 'testSource';
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialRegister(req, res);
      await responseEndPromise; //

      expect(res.render).toHaveBeenCalledWith('social_oauth', {
        url: 'mock_google_auth_url',
      });
    });

    it('should handle Outlook sign-up', async () => {
      req.params.social = 'outlook';
      req.params.source = 'testSource';
      resSendSpy = jest.spyOn(res, 'render');
      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialRegister(req, res);
      await responseEndPromise; //

      expect(res.render).toHaveBeenCalledWith('social_oauth', {
        url: 'mocked-authorization-uri',
      });
    });

    it('should return error if Google authorization URI is not generated', async () => {
      resSendSpy = jest.spyOn(res, 'json');
      req.params.social = 'google';
      google.auth.OAuth2.mockImplementationOnce(() => ({
        generateAuthUrl: jest.fn().mockReturnValue(null),
      }));

      const responseEndPromise = once(res, 'end'); // create the res end event promise
      await appSocialRegister(req, res);
      await responseEndPromise; //

      expect(res.json).toHaveBeenCalledWith({
        status: false,
        error: 'Client doesn`t exist',
      });
    });
  });

  afterEach(async () => {
    // To Do Something
  });
});
