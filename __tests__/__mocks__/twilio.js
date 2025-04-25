class Twilio {}
const twilio = jest.fn(() => new Twilio());

module.exports = twilio;
module.exports.Twilio = Twilio;
