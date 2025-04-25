const moment = require('moment-timezone');
const { TIME_ZONE_NAMES } = require('../constants/variable');

const _ = require('lodash');
const urls = require('../constants/urls');
const Appointment = require('../models/appointment');
const Note = require('../models/note');
const Activity = require('../models/activity');
const User = require('../models/user');
const Contact = require('../models/contact');
const EventType = require('../models/event_type');
const {
  getCalendarListByUser,
  googleCalendarFreeBusyList,
  outlookCalendarFreeBusyList,
} = require('./appointment');
const {
  addOutlookCalendarById,
  addGoogleCalendarById,
  updateGoogleCalendarById,
  updateOutlookCalendarById,
} = require('../helpers/appointment');
const graph = require('@microsoft/microsoft-graph-client');

const { sendNotificationEmail } = require('../helpers/notification');
const { createUserMeeting } = require('../helpers/zoom');
const Garbage = require('../models/garbage');
const { assignTimeline } = require('../helpers/automation');
const {
  THIRD_PARTIES,
  thirdPartyConnectionError,
} = require('../helpers/scheduler_event');
const { checkIdentityTokens, getOauthClients } = require('../helpers/user');
const {
  getContactOutboundData,
  outboundCallhookApi,
} = require('../helpers/outbound');
const { outbound_constants } = require('../constants/variable');
const { LEAD_SOURCE_TYPE } = require('../constants/outbound');
const { shareContactsToOrganization } = require('../helpers/contact');
/**
 * Check the location Type & Create the zoom meeting or google hang out meeting
 * @param {*} event_type: Event Type Document
 * @returns
 */
const createScheduleMeeting = async (event_type, event, user) => {
  return new Promise((resolve) => {
    if (event_type.location && event_type.location.type === 'zoom') {
      const {
        first_name,
        last_name,
        title,
        description,
        start_time,
        timezone,
      } = event;
      const agenda = `${description}`;
      const topic = `Meeting with ${first_name} ${last_name}: ${title}`;
      const meetingReq = {
        user,
        start_time,
        timezone,
        topic,
        agenda,
        duration: event_type.duration,
      };
      createUserMeeting(meetingReq)
        .then((_meeting) => {
          if (_meeting) {
            resolve({ status: true, url: _meeting.join_url });
          } else {
            resolve({ status: false });
          }
        })
        .catch(async (err) => {
          const currentUser = await User.findOne({ _id: user });
          await thirdPartyConnectionError(
            THIRD_PARTIES.ZOOM_MEETING,
            currentUser,
            err
          );

          resolve({ status: false });
        });
    } else {
      resolve({ status: false });
    }
  });
};

/**
 * Create the Event from Scheduler Page
 * @param {*} req
 * @param {*} res
 * @returns
 */
const create = async (req, res) => {
  const { user_id, event_type: event_type_id, due_start, email } = req.body;
  const currentUser = await User.findOne({ _id: user_id });

  const _appointment = req.body;
  const event_type = await EventType.findOne({
    _id: event_type_id,
  });

  if (!currentUser) {
    return res.status(427).json({
      status: false,
      error: 'Invalid user',
    });
  }
  if (!event_type) {
    return res.status(427).json({
      status: false,
      error: 'This scheduler is expired.',
    });
  }
  await checkIdentityTokens(currentUser);
  const { scheduler_info } = currentUser;

  if (!scheduler_info || !scheduler_info.is_enabled) {
    return res.status(427).json({
      status: false,
      error: 'This user scheduler is not enabled yet.',
    });
  }

  const calendar_list = currentUser.calendar_list;

  // Check the prev registered group appointment
  const existAppointment = await Appointment.findOne({
    due_start: _appointment.due_start,
    type: 2,
    event_type: event_type_id,
    user: user_id,
  });
  const { connected_email, calendar_id } = scheduler_info;
  let calendar;
  calendar_list.some((_calendar) => {
    if (_calendar.connected_email === connected_email) {
      calendar = _calendar;
      return true;
    }
  });

  let event_id;
  let recurrence_id;

  if (existAppointment) {
    if (event_type.type === 1) {
      return res.status(427).json({
        status: false,
        error: 'This user meeting is not enabled yet.',
      });
    } else {
      const guests = _.union(existAppointment.guests, _appointment.guests);
      if (calendar?.connected_calendar_type === 'outlook') {
        const appointment_data = {
          guests,
          calendar_id,
        };
        const calendar_data = {
          event_id: existAppointment.event_id,
          appointment: appointment_data,
          calendar,
          onlyGuests: true,
          source: currentUser.source,
        };
        await updateOutlookCalendarById(calendar_data).catch(async (err) => {
          await thirdPartyConnectionError(
            THIRD_PARTIES.OUTLOOK_CALENDAR,
            currentUser,
            err
          );
        });
        event_id = existAppointment.event_id;
        recurrence_id = existAppointment.recurrence_id;
      } else if (calendar?.connected_calendar_type === 'google') {
        const token = JSON.parse(calendar.google_refresh_token);

        const appointment_data = {
          guests,
        };
        const calendar_data = {
          source: currentUser.source,
          refresh_token: token.refresh_token,
          event_id: existAppointment.event_id,
          appointment: appointment_data,
          calendar_id,
        };
        await updateGoogleCalendarById(calendar_data).catch(async (err) => {
          await thirdPartyConnectionError(
            THIRD_PARTIES.GOOGLE_CALENDAR,
            currentUser,
            err
          );
        });
        event_id = existAppointment.event_id;
        recurrence_id = existAppointment.recurrence_id;
      }
      await leadContactByScheduler({
        appointment: req.body,
        old_appointment: existAppointment,
        user: user_id,
        event_type_id,
        event_id,
        recurrence_id,
      });
      return res.send({
        status: true,
      });
    }
  } else {
    const data = { user_id, event_type_id, date: due_start };
    try {
      const response = await checkConflict(data);
      if (response.status) {
        const meeting = await createScheduleMeeting(
          event_type,
          _appointment,
          currentUser._id
        ).catch(() => {
          console.log('Zoom meeting creation is failed.');
        });
        if (meeting && meeting.status) {
          _appointment.location = meeting.url;
          _appointment.description += `<br>Meeting Link:<div>${meeting.url}</div>`;
          req.body = _appointment;
        }

        if (calendar?.connected_calendar_type === 'outlook') {
          if (event_type.location.type === 'google') {
            return res.status(400).send({
              status: false,
              error: 'Please select google calendar.',
            });
          }
          const data = {
            source: currentUser.source,
            appointment: _appointment,
            calendar,
            calendar_id,
          };
          const { new_event_id, new_recurrence_id } =
            await addOutlookCalendarById(data).catch((err) => {
              thirdPartyConnectionError(
                THIRD_PARTIES.OUTLOOK_CALENDAR,
                currentUser,
                err
              );
            });
          event_id = new_event_id;
          recurrence_id = new_recurrence_id;
        } else if (calendar?.connected_calendar_type === 'google') {
          const token = JSON.parse(calendar.google_refresh_token);
          const notification = true;
          if (event_type.location.type === 'google') {
            _appointment['isGoogleMeet'] = true;
          }

          const data = {
            source: currentUser.source,
            refresh_token: token.refresh_token,
            appointment: _appointment,
            calendar_id,
            notification,
          };
          console.log(data);
          try {
            const { new_event_id, new_recurrence_id, meeting_url } =
              await addGoogleCalendarById(data);
            if (meeting_url) {
              _appointment.location = meeting_url;
              _appointment.description += `<br>Meeting Link:<div>${meeting_url}</div>`;
              req.body = _appointment;
            }
            event_id = new_event_id;
            recurrence_id = new_recurrence_id;
          } catch (err) {
            thirdPartyConnectionError(
              THIRD_PARTIES.GOOGLE_CALENDAR,
              currentUser,
              err
            );
          }
        }
        await leadContactByScheduler({
          appointment: req.body,
          user: user_id,
          event_type_id,
          event_id,
          recurrence_id,
        });
        return res.send({
          status: true,
        });
      } else {
        return res.status(400).json({
          status: false,
          error: response.error,
        });
      }
    } catch (err) {
      console.log('err occurred', err);
      return res.status(400).json({
        status: false,
        error: err,
      });
    }
  }
};

const loadConflicts = async (req, res) => {
  const { current, end, user_id } = req.body;
  const currentUser = await User.findOne({
    _id: user_id,
    del: false,
  });

  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const calendar_list = currentUser.calendar_list;

  if (calendar_list.length) {
    const promise_array = [];

    for (let i = 0; i < calendar_list.length; i++) {
      const {
        connected_calendar_type,
        connected_email,
        check_conflict_scheduler,
      } = calendar_list[i];

      if (check_conflict_scheduler !== false) {
        if (connected_calendar_type === 'outlook') {
          let accessToken;
          const { outlook_refresh_token } = calendar_list[i];
          const token = msClient.createToken({
            refresh_token: outlook_refresh_token,
            expires_in: 0,
          });
          await new Promise((resolve, reject) => {
            token
              .refresh()
              .then((data) => resolve(data.token))
              .catch((err) => reject(err));
          })
            .then((token) => {
              accessToken = token.access_token;
            })
            .catch((error) => {
              console.log('error', error);
            });

          if (!accessToken) {
            promise_array.push(
              new Promise((resolve) => {
                resolve({
                  status: false,
                  error: connected_email,
                });
              })
            );
            continue;
          }

          const client = graph.Client.init({
            // Use the provided access token to authenticate
            // requests
            authProvider: (done) => {
              done(null, accessToken);
            },
          });

          // const due_end = moment(date).add(1, `${mode}s`);
          const calendar_data = {
            client,
            connected_email,
            due_start: moment(current).toDate(),
            due_end: moment(end).toDate(),
          };

          const outlook_calendar = outlookCalendarFreeBusyList(calendar_data);
          promise_array.push(outlook_calendar);
        } else {
          const calendar = calendar_list[i];
          const { google_refresh_token } = calendar;
          const token = JSON.parse(google_refresh_token);
          googleClient.setCredentials({
            refresh_token: token.refresh_token,
          });
          // const due_end = moment(date).add(1, `${mode}s`);
          const calendar_data = {
            auth: googleClient,
            due_start: moment(current).toDate(),
            due_end: moment(end).toDate(),
            connected_email,
          };

          const google_calendar = googleCalendarFreeBusyList(calendar_data);
          promise_array.push(google_calendar);
        }
      }
    }

    Promise.all(promise_array)
      .then((data) => {
        const all_data = [];
        data.forEach((e) => {
          if (e.status) {
            all_data.push(e.data);
          }
        });
        return res.send({
          status: true,
          data: all_data,
        });
      })
      .catch(() => {
        return res.status(400).json({
          status: false,
        });
      });
  } else {
    return res.send({
      status: true,
      data: [],
    });
  }
};

const loadEvents = async (req, res) => {
  const { searchOption, user_id } = req.body;

  const currentUser = await User.findOne({ _id: user_id, del: false });

  const count = req.body.count || 20;
  const skip = req.body.skip || 0;

  if (!currentUser) {
    return res.status(400).json({
      status: false,
      error: 'User disabled',
    });
  }
  if (searchOption) {
    const { event_type, due_start, due_end } = searchOption;
    const query = {};
    if (Array.isArray(event_type) && event_type.length) {
      query.event_type = { $in: event_type };
    }

    if (due_end) {
      query.due_end = { $lte: new Date(due_end) };
    }

    if (due_start) {
      query.due_start = { $gte: new Date(due_start) };
    }

    const appointments = await Appointment.find({
      user: currentUser.id,
      type: 2,
      ...query,
    })
      .skip(skip)
      .limit(count)
      .populate('contacts')
      .populate('event_type');

    const total = await Appointment.find({
      user: currentUser.id,
      type: 2,
      ...query,
    }).count();

    return res.send({
      status: true,
      data: appointments,
      total,
    });
  } else {
    const appointments = await Appointment.find({
      user: currentUser.id,
      type: 2,
    })
      .populate('contacts')
      .skip(skip)
      .limit(count);

    const total = await Appointment.find({
      user: currentUser.id,
      type: 2,
    }).count();

    return res.send({
      status: true,
      data: appointments,
      total,
    });
  }
};

const checkConflict = async (data) => {
  const { user_id, event_type_id, date } = data;

  const event_type = await EventType.findOne({ _id: event_type_id });

  if (!event_type) {
    return Promise((resolve) => {
      resolve({
        status: false,
        error: 'invalid event type',
      });
    });
  }

  const due_start = date;
  const due_end = moment(date).add(event_type.duration, `minutes`);

  const currentUser = await User.findOne({ _id: user_id });
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const { calendar_list } = currentUser;
  const promise_array = [];
  for (let i = 0; i < calendar_list.length; i++) {
    const {
      connected_calendar_type,
      connected_email,
      check_conflict_scheduler,
    } = calendar_list[i];

    if (check_conflict_scheduler !== false) {
      if (connected_calendar_type === 'outlook') {
        let accessToken;
        const { outlook_refresh_token } = calendar_list[i];
        const token = msClient.createToken({
          refresh_token: outlook_refresh_token,
          expires_in: 0,
        });

        await new Promise((resolve, reject) => {
          token
            .refresh()
            .then((data) => resolve(data.token))
            .catch((err) => reject(err));
        })
          .then((token) => {
            accessToken = token.access_token;
          })
          .catch((error) => {
            console.log('error', error);
          });

        if (!accessToken) {
          promise_array.push(
            new Promise((resolve) => {
              resolve({
                status: false,
                error: connected_email,
              });
            })
          );
          continue;
        }

        const client = graph.Client.init({
          // Use the provided access token to authenticate
          // requests
          authProvider: (done) => {
            done(null, accessToken);
          },
        });

        const calendar_data = {
          client,
          connected_email,
          due_start: moment(due_start).toDate(),
          due_end: moment(due_end).toDate(),
        };

        const outlook_calendar = outlookCalendarFreeBusyList(calendar_data);
        promise_array.push(outlook_calendar);
      } else {
        const calendar = calendar_list[i];
        const { google_refresh_token } = calendar;
        const token = JSON.parse(google_refresh_token);
        googleClient.setCredentials({ refresh_token: token.refresh_token });

        const calendar_data = {
          auth: googleClient,
          due_start: moment(due_start).toDate(),
          due_end: moment(due_end).toDate(),
          connected_email,
        };

        const google_calendar = googleCalendarFreeBusyList(calendar_data);
        promise_array.push(google_calendar);
      }
    }
  }

  return new Promise((resolve) => {
    Promise.all(promise_array)
      .then(async (response_array) => {
        const all_data = [];
        response_array.forEach((_response) => {
          if (_response.status) {
            all_data.push(_response.data);
          }
        });
        if (all_data.length > 0) {
          let scheduled = false;
          all_data.forEach((e) => {
            if (Object.keys(e).length) {
              Object.keys(e).forEach((key) => {
                if (e[key].busy.length) {
                  scheduled = true;
                }
              });
            }
          });

          if (!scheduled) {
            return resolve({
              status: true,
            });
          } else {
            return resolve({
              status: false,
              error: 'another meeting time busy',
            });
          }
        } else {
          return resolve({
            status: true,
          });
        }
      })
      .catch((err) => {
        console.log('check event err', err);
        return resolve({
          status: false,
          error: 'check event err',
        });
      });
  });
};

const leadContactByScheduler = async (data) => {
  const {
    appointment,
    user,
    event_type_id,
    event_id,
    recurrence_id,
    old_appointment,
  } = data;

  const currentUser = await User.findOne({ _id: user });
  // adding contact
  const prefix = currentUser.source === 'vortex' ? 'Vortex' : '';
  const isVortex = currentUser.source === 'vortex';
  let contact = await Contact.findOne({
    email: appointment.email,
    user,
  });

  const event_type = await EventType.findOne({
    _id: event_type_id,
  }).catch((err) => {
    console.log('event type get err', err.message);
  });
  const tags = event_type.tags || ['schedulerlead'];

  if (!contact) {
    contact = new Contact({
      first_name: appointment.first_name,
      last_name: appointment.last_name,
      email: appointment.email,
      tags,
      user,
      source: LEAD_SOURCE_TYPE.LEADSCHEDULE,
      cell_phone: appointment.phone_number
        ? appointment.phone_number
        : undefined,
    });
    await contact.save().catch((err) => {
      console.log('contact save err', err.message);
    });
    await shareContactsToOrganization(currentUser, contact._id).catch((err) =>
      console.log('share contacts to organization err', err.message)
    );
  } else {
    Contact.updateOne(
      {
        _id: contact.id,
      },
      {
        source: LEAD_SOURCE_TYPE.LEADSCHEDULE,
        $addToSet: { tags: { $each: tags } },
      }
    ).catch((err) => {
      console.log('contact update schedulerlead err', err.message);
    });
  }
  outboundCallhookApi(
    currentUser.id,
    outbound_constants.LEAD_SOURCE,
    getContactOutboundData,
    {
      _id: contact._id,
      type: LEAD_SOURCE_TYPE.LEADSCHEDULE,
      lead: event_type_id,
    }
  );
  let _appointment;
  if (old_appointment) {
    _appointment = old_appointment;
    const guests = appointment.guests.filter(
      (e) => !_appointment.guests.includes(e)
    );
    Appointment.updateOne(
      {
        _id: old_appointment._id,
      },
      {
        $push: {
          guests: { $each: guests },
          contacts: contact.id,
        },
      }
    ).catch((err) => {
      console.log('update err', err.message);
    });
  } else {
    const garbage = await Garbage.findOne({ user }).catch((err) => {
      console.log('garbage find err', err.message);
    });
    const reminder_scheduler = garbage?.reminder_scheduler || 30;

    const remind_at = moment(appointment.due_start)
      .clone()
      .subtract(reminder_scheduler, 'minutes');
    _appointment = new Appointment({
      ...appointment,
      contacts: contact.id,
      user,
      type: 2,
      event_type: event_type_id,
      event_id,
      recurrence_id,
      remind_at,
    });
    _appointment.save().catch((err) => {
      console.log('appointment save err', err.message);
    });
  }

  const activity = new Activity({
    content: 'scheduled meeting',
    contacts: contact.id,
    appointments: _appointment.id,
    user,
    type: 'appointments',
  });

  activity
    .save()
    .then((_activity) => {
      Contact.updateOne(
        {
          _id: contact.id,
        },
        {
          $set: { last_activity: _activity.id },
        }
      ).catch((err) => {
        console.log('err', err);
      });
    })
    .catch((err) => {
      console.log('err', err);
    });

  const note = new Note({
    content: _appointment.description,
    contact: contact.id,
    user: currentUser.id,
  });
  const _note = await note.save();

  const noteActivity = new Activity({
    content: 'added note',
    contacts: contact.id,
    user: currentUser.id,
    type: 'notes',
    notes: _note.id,
    created_at: new Date(),
    updated_at: new Date(),
  });

  noteActivity
    .save()
    .then((_activity) => {
      Contact.updateOne(
        {
          _id: contact.id,
        },
        {
          $set: { last_activity: _activity.id },
        }
      ).catch((err) => {
        console.log('err', err);
      });
    })
    .catch((err) => {
      console.log('err', err);
    });

  if (event_type['automation']) {
    let multiple_by = 1;
    switch (event_type['auto_trigger_time']) {
      case 'days':
        multiple_by = 60 * 24;
        break;
      case 'hours':
        multiple_by = 60;
        break;
    }
    const trigger_duration_minutes =
      event_type['auto_trigger_duration'] * multiple_by;
    let custom_period = 0;
    let scheduled_time;
    switch (event_type['auto_trigger_type']) {
      case '1':
        custom_period = trigger_duration_minutes;
        scheduled_time = moment().toISOString();
        break;
      case '2':
        custom_period = -trigger_duration_minutes;
        scheduled_time = appointment['due_start'];
        break;
      case '3':
        custom_period = trigger_duration_minutes;
        scheduled_time = appointment['due_start'];
        break;
      case '4':
        custom_period = trigger_duration_minutes;
        scheduled_time = appointment['due_end'];
        break;
    }

    const timeline_data = {
      assign_array: [contact.id],
      automation_id: event_type['automation'],
      user_id: user,
      appointment: _appointment.id,
      required_unique: false,
      custom_period,
      scheduled_time,
      type: 'contact',
    };

    assignTimeline(timeline_data)
      .then(({ result: _res }) => {
        if (!_res[0].status) {
          console.log('automation assign err', _res[0].error);
        }
      })
      .catch((err) => {
        console.log('assign automation err', err.message);
      });
  }

  const zoneName = TIME_ZONE_NAMES[_appointment?.timezone];
  const email_data = {
    template_data: {
      user_name: currentUser.user_name,
      event_type_name: event_type.title,
      event_type_url: `${isVortex ? urls.CALENDAR_VORTEX : urls.CALENDAR}${
        event_type.link
      }`,
      duration: event_type.duration + ' mins',
      scheduled_time: `${moment(appointment.due_start)
        .tz(_appointment?.timezone)
        .format('hh:mm A')} - ${moment(appointment.due_end)
        .tz(_appointment?.timezone)
        .format('hh:mm A dddd, MMMM DD, YYYY')}`,
      invite_name: appointment.first_name + ' ' + appointment.last_name,
      invite_email: appointment.email,
      invite_description: appointment.description,
      time_zone: zoneName,
    },
    template_name: prefix + 'ScheduleEvent',
    required_reply: false,
    email: [currentUser.email],
    source: currentUser.source,
  };

  await sendNotificationEmail(email_data);
};

module.exports = {
  create,
  checkConflict,
  loadConflicts,
  loadEvents,
};
