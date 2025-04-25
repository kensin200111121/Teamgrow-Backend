const moment = require('moment-timezone');
const { google } = require('googleapis');
const Appointment = require('../models/appointment');
const Activity = require('../models/activity');
const ActivityHelper = require('../helpers/activity');
const { createUserMeeting } = require('../helpers/zoom');
// const Reminder = require('../models/reminder');
const User = require('../models/user');
const Contact = require('../models/contact');
const graph = require('@microsoft/microsoft-graph-client');
const {
  getAllCalendars,
  addOutlookCalendarById,
  addGoogleCalendarById,
  updateOutlookCalendarById,
  updateGoogleCalendarById,
  removeGoogleCalendarById,
  removeOutlookCalendarById,
} = require('../helpers/appointment');
const { checkIdentityTokens, getOauthClients } = require('../helpers/user');

const getAll = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  let { date, mode } = req.query;
  if (!mode) {
    mode = 'week';
  }

  if (!date) {
    date = moment().tz().startOf(mode);
  } else {
    date = moment(date).add(1, 'minute').tz(currentUser.time_zone_info);
    date = moment(date).startOf(mode);
  }
  let calendar_list = [];
  if (currentUser.calendar_connected && currentUser.calendar_list) {
    calendar_list = currentUser.calendar_list;
  }
  if (calendar_list?.length) {
    const promise_array = [];

    for (let i = 0; i < calendar_list.length; i++) {
      const { connected_calendar_type } = calendar_list[i];
      if (connected_calendar_type === 'outlook') {
        let accessToken;
        const { connected_email, outlook_refresh_token, version } =
          calendar_list[i];
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
            console.log('error', error?.data?.payload || error?.message);
          });

        if (!accessToken) {
          promise_array.push(
            new Promise((resolve, reject) => {
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

        const due_end = moment(date).add(1, `${mode}s`);
        const calendar_data = {
          client,
          connected_email,
          due_start: date,
          due_end,
        };
        const outlook_calendar = outlookCalendarList(calendar_data);
        promise_array.push(outlook_calendar);
      } else {
        const calendar = calendar_list[i];

        const { google_refresh_token, connected_email } = calendar;
        const token = JSON.parse(google_refresh_token);
        googleClient.setCredentials({ refresh_token: token.refresh_token });

        const due_end = moment(date).add(1, `${mode}s`);
        const calendar_data = {
          auth: googleClient,
          due_start: date,
          due_end,
          connected_email,
        };

        const google_calendar = googleCalendarList(calendar_data);
        promise_array.push(google_calendar);
      }
    }

    Promise.all(promise_array)
      .then((data) => {
        const result = data.filter((e) => !!e);
        return res.send({
          status: true,
          data: result,
        });
      })
      .catch((err) => {
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

const googleCalendarList = (calendar_data) => {
  const { connected_email, auth, due_start, due_end } = calendar_data;
  const data = [];

  const calendar = google.calendar({ version: 'v3', auth });
  return new Promise((resolve) => {
    calendar.calendarList.list(
      {
        maxResults: 2500,
      },
      function (err, result) {
        if (err) {
          return resolve({
            status: false,
            error: connected_email,
          });
        }

        const calendars = result.data.items;

        if (calendars) {
          const promise_array = [];

          for (let i = 0; i < calendars.length; i++) {
            if (calendars[i].accessRole === 'owner') {
              const promise = new Promise(async (resolve) => {
                const calendar_data = {
                  id: calendars[i].id,
                  title: calendars[i].summary,
                  time_zone: calendars[i].timeZone,
                  color: calendars[i].backgroundColor,
                  items: [],
                  recurrence_info: {},
                };

                await calendar.events.list(
                  {
                    calendarId: calendars[i].id,
                    timeMin: due_start.toISOString(),
                    timeMax: due_end.toISOString(),
                    singleEvents: true,
                    maxResults: 2500,
                  },
                  async (err, _res) => {
                    if (err) {
                      console.log(`The API returned an error2: ${err}`);
                      data.push(calendar_data);
                      resolve();
                    } else {
                      const events = _res.data.items;
                      const recurrence_ids = [];
                      if (events.length) {
                        for (let j = 0; j < events.length; j++) {
                          const event = events[j];
                          const guests = [];

                          if (event.attendees) {
                            for (let j = 0; j < event.attendees.length; j++) {
                              const guest = event.attendees[j].email;
                              const response =
                                event.attendees[j].responseStatus;
                              guests.push({ email: guest, response });
                            }
                          }
                          const _gmail_calendar_data = {};
                          _gmail_calendar_data.title = event.summary;
                          _gmail_calendar_data.description = event.description;
                          _gmail_calendar_data.location = event.location;
                          _gmail_calendar_data.due_start =
                            event.start.dateTime || event.start.date;
                          _gmail_calendar_data.due_end =
                            event.end.dateTime || event.end.date;
                          _gmail_calendar_data.guests = guests;
                          _gmail_calendar_data.timezone =
                            event.start.timeZone || event.end.timeZone;
                          if (event.hangoutLink) {
                            _gmail_calendar_data.hangoutLink =
                              event.hangoutLink;
                            _gmail_calendar_data.isGoogleMeet = true;
                          } else {
                            _gmail_calendar_data.isGoogleMeet = false;
                          }
                          if (
                            !event.start.dateTime &&
                            !event.end.dateTime &&
                            event.start.date &&
                            event.end.date
                          ) {
                            _gmail_calendar_data.is_full = true;
                          } else {
                            _gmail_calendar_data.is_full = false;
                          }

                          if (event.recurringEventId) {
                            if (
                              !recurrence_ids.includes(event.recurringEventId)
                            ) {
                              recurrence_ids.push(event.recurringEventId);
                            }
                            _gmail_calendar_data.recurrence_id =
                              event.recurringEventId;
                          }

                          if (event.organizer) {
                            _gmail_calendar_data.organizer =
                              event.organizer.email;
                            if (event.organizer.email === calendars[i].id) {
                              _gmail_calendar_data.is_organizer = true;
                            }
                          }

                          _gmail_calendar_data.calendar_id = calendars[i].id;
                          _gmail_calendar_data.event_id = event.id;
                          calendar_data.items.push(_gmail_calendar_data);
                        }

                        if (recurrence_ids.length) {
                          for (let j = 0; j < recurrence_ids.length; j++) {
                            const _data = {
                              googleClient: auth,
                              calendar_id: calendars[i].id,
                              calendar_event_id: recurrence_ids[j],
                            };

                            await getGoogleEventById(_data)
                              .then((_event) => {
                                if (_event && _event.recurrence) {
                                  let _recurrence = '';
                                  if (
                                    _event.recurrence[0].indexOf('DAILY') !== -1
                                  ) {
                                    _recurrence = 'DAILY';
                                  } else if (
                                    _event.recurrence[0].indexOf('WEEKLY') !==
                                    -1
                                  ) {
                                    _recurrence = 'WEEKLY';
                                  } else if (
                                    _event.recurrence[0].indexOf('MONTHLY') !==
                                    -1
                                  ) {
                                    _recurrence = 'MONTHLY';
                                  } else if (
                                    _event.recurrence[0].indexOf('YEARLY') !==
                                    -1
                                  ) {
                                    _recurrence = 'YEARLY';
                                  }
                                  const recurrence_details =
                                    _event.recurrence[0].split(';');
                                  let until;
                                  if (recurrence_details.length > 0) {
                                    recurrence_details.forEach((e) => {
                                      if (e.includes('UNTIL')) {
                                        until = e.split('UNTIL=')[1];
                                      }
                                    });
                                  }
                                  calendar_data.recurrence_info[
                                    recurrence_ids[j]
                                  ] = {
                                    recurrence: _recurrence,
                                    originalStartTime:
                                      _event.start.dateTime ||
                                      _event.start.date,
                                    originalEndTime:
                                      _event.end.dateTime || _event.end.date,
                                    until,
                                  };
                                }
                              })
                              .catch((err) => {
                                console.error(
                                  'calendar event detail getting',
                                  err
                                );
                              });
                          }
                        }

                        data.push(calendar_data);
                        resolve();
                      } else {
                        console.log('No upcoming events found.');
                        resolve();
                      }
                    }
                  }
                );
              });
              promise_array.push(promise);
            }
          }
          Promise.all(promise_array).then(() => {
            resolve({
              status: true,
              calendar: {
                email: connected_email,
                data,
              },
            });
          });
        }
      }
    );
  });
};

const outlookCalendarList = (calendar_data) => {
  const { client, connected_email, due_start, due_end } = calendar_data;
  const data = [];
  const promise_array = [];

  return new Promise((resolve) => {
    client
      .api('/me/calendars')
      // .header('Prefer', `outlook.timezone="${ctz}"`)
      .get()
      .then(async (outlook_calendars) => {
        const calendars = outlook_calendars.value;

        if (calendars.length > 0) {
          // The start and end date are passed as query parameters
          const startDateTime = due_start.toISOString();
          const endDateTime = due_end.toISOString();

          for (let i = 0; i < calendars.length; i++) {
            const calendar = calendars[i];

            if (calendar.canEdit) {
              const promise = new Promise(async (resolve) => {
                const calendar_data = {
                  id: calendar.id,
                  title: calendar.name,
                  color:
                    calendar.hexColor === '' ? undefined : calendar.hexColor,
                  items: [],
                  recurrence_info: {},
                };
                const outlook_events = await client
                  .api(
                    `/me/calendars/${calendar.id}/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&top=2500`
                  )
                  // .header('Prefer', `outlook.timezone="${ctz}"`)
                  .get()
                  .catch((err) => {
                    console.log('outlook calendar events get err', err);
                  });
                if (outlook_events && outlook_events.value) {
                  const recurrence_ids = [];
                  const calendar_events = outlook_events.value;

                  for (let j = 0; j < calendar_events.length; j++) {
                    const guests = [];
                    const calendar_event = calendar_events[j];

                    if (
                      calendar_event.attendees &&
                      calendar_event.attendees.length > 0
                    ) {
                      const attendees = calendar_event.attendees;
                      for (let j = 0; j < attendees.length; j++) {
                        const guest = attendees[j].emailAddress.address;
                        let response = '';
                        switch (attendees[j].status.response) {
                          case 'none':
                            response = 'needsAction';
                            break;
                          case 'organizer':
                            response = 'accepted';
                            break;
                          case 'declined':
                            response = 'declined';
                            break;
                          case 'accepted':
                            response = 'accepted';
                            break;
                          case 'tentativelyAccepted':
                            response = 'tentative';
                            break;
                          case 'notResponded':
                            response = 'needsAction';
                            break;
                          default:
                            response = 'needsAction';
                            break;
                        }
                        guests.push({ email: guest, response });
                      }
                    }
                    const _outlook_calendar_data = {
                      service_type: 'outlook',
                    };
                    _outlook_calendar_data.title = calendar_event.subject;
                    if (calendar_event.body) {
                      _outlook_calendar_data.description =
                        calendar_event.body.content;
                    } else {
                      _outlook_calendar_data.description = '';
                    }
                    if (calendar_event.location) {
                      _outlook_calendar_data.location =
                        calendar_event.location.displayName;
                    } else {
                      _outlook_calendar_data.location = '';
                    }
                    _outlook_calendar_data.timezone =
                      calendar_event.originalStartTimeZone ||
                      calendar_event.originalEndTimeZone;
                    _outlook_calendar_data.is_full = calendar_event.isAllDay;
                    if (calendar_event.start) {
                      if (calendar_event.isAllDay) {
                        _outlook_calendar_data.due_start = moment(
                          calendar_event.start.dateTime
                        ).format('YYYY-MM-DD');
                      } else {
                        _outlook_calendar_data.due_start =
                          calendar_event.start.dateTime;
                      }
                      // _outlook_calendar_data.time_zone =
                      //   calendar_event.start.timezone;
                      // _outlook_calendar_data.due_start = moment
                      //   .tz(
                      //     _outlook_calendar_data.due_start,
                      //     _outlook_calendar_data.time_zone
                      //   )
                      //   .toISOString();
                    } else {
                      _outlook_calendar_data.due_start = '';
                    }
                    if (calendar_event.end) {
                      if (calendar_event.isAllDay) {
                        _outlook_calendar_data.due_end = moment(
                          calendar_event.end.dateTime
                        )
                          .subtract(1, 'days')
                          .format('YYYY-MM-DD');
                      } else {
                        _outlook_calendar_data.due_end =
                          calendar_event.end.dateTime;
                      }
                      // _outlook_calendar_data.due_end =
                      //   calendar_event.end.dateTime;
                      // _outlook_calendar_data.time_zone =
                      //   calendar_event.end.timezone;
                      // _outlook_calendar_data.due_end = moment
                      //   .tz(
                      //     _outlook_calendar_data.due_end,
                      //     _outlook_calendar_data.time_zone
                      //   )
                      //   .toISOString();
                    } else {
                      _outlook_calendar_data.due_end = '';
                    }
                    if (calendar_event.organizer) {
                      if (calendar_event.isOrganizer) {
                        _outlook_calendar_data.is_organizer = true;
                        _outlook_calendar_data.organizer = connected_email;
                      } else {
                        _outlook_calendar_data.organizer =
                          calendar_event.organizer.emailAddress.address;
                      }
                    }

                    _outlook_calendar_data.guests = guests;
                    _outlook_calendar_data.event_id = calendar_event.id;
                    _outlook_calendar_data.calendar_id = calendar.id;
                    if (calendar_event.seriesMasterId) {
                      _outlook_calendar_data.recurrence_id =
                        calendar_event.seriesMasterId;
                      if (
                        !recurrence_ids.includes(
                          _outlook_calendar_data.recurrence_id
                        )
                      ) {
                        recurrence_ids.push(
                          _outlook_calendar_data.recurrence_id
                        );
                      }
                    }

                    calendar_data.items.push(_outlook_calendar_data);
                  }
                  if (recurrence_ids.length > 0) {
                    for (let j = 0; j < recurrence_ids.length; j++) {
                      const master_id = recurrence_ids[j];
                      const master_event = await client
                        .api(`/me/events/${master_id}`)
                        // .header('Prefer', `outlook.timezone="${ctz}"`)
                        .get()
                        .catch((err) => {
                          console.log('outlook calendar events get err', err);
                        });
                      if (master_event.recurrence) {
                        let _recurrence = '';
                        if (
                          master_event.recurrence.pattern &&
                          master_event.recurrence.pattern.type.indexOf(
                            'daily'
                          ) !== -1
                        ) {
                          _recurrence = 'DAILY';
                        } else if (
                          master_event.recurrence.pattern &&
                          master_event.recurrence.pattern.type.indexOf(
                            'weekly'
                          ) !== -1
                        ) {
                          _recurrence = 'WEEKLY';
                        } else if (
                          master_event.recurrence.pattern &&
                          master_event.recurrence.pattern.type.indexOf(
                            'Monthly'
                          ) !== -1
                        ) {
                          _recurrence = 'MONTHLY';
                        } else if (
                          master_event.recurrence.pattern &&
                          master_event.recurrence.pattern.type.indexOf(
                            'absoluteYearly'
                          ) !== -1
                        ) {
                          _recurrence = 'YEARLY';
                        }
                        calendar_data.recurrence_info[recurrence_ids[j]] = {
                          recurrence: _recurrence,
                          originalStartTime:
                            master_event.start.dateTime ||
                            master_event.start.date,
                          originalEndTime:
                            master_event.end.dateTime || master_event.end.date,
                        };
                      }
                    }
                  }
                }
                data.push(calendar_data);
                resolve();
              });
              promise_array.push(promise);
            }
          }
        }
        Promise.all(promise_array).then(() => {
          resolve({
            status: true,
            calendar: {
              email: connected_email,
              data,
            },
          });
        });
      })
      .catch((err) => {
        console.log('calendar event err', err);
        resolve();
      });
  });
};

const googleCalendarFreeBusyList = (calendar_data) => {
  const { connected_email, auth, due_start, due_end } = calendar_data;
  const data = {
    timeMin: due_start,
    timeMax: due_end,
    items: [
      {
        id: connected_email,
      },
    ],
  };
  const calendar = google.calendar({ version: 'v3', auth });
  return new Promise((resolve, reject) => {
    calendar.freebusy.query(
      {
        resource: {
          timeMin: due_start,
          timeMax: due_end,
          items: [
            {
              id: connected_email,
            },
          ],
        },
      },
      function (err, events) {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service: ${err}`
          );
          resolve({
            status: false,
            err,
          });
        }
        resolve({
          status: true,
          data: events?.data?.calendars || [],
        });
      }
    );
  });
};

const outlookCalendarFreeBusyList = (calendar_data) => {
  const { client, connected_email, due_start, due_end } = calendar_data;
  const data = {
    schedules: [connected_email],
    StartTime: {
      dateTime: due_start,
      timeZone: 'UTC',
    },
    EndTime: {
      dateTime: due_end,
      timeZone: 'UTC',
    },
    availabilityViewInterval: '5',
  };
  return new Promise(async (resolve) => {
    await client
      .api(`/me/calendar/getSchedule`)
      .post(data)
      .then((_res) => {
        const _event = {};
        _res.value.forEach((e) => {
          _event[e.scheduleId] = {
            busy: [],
          };
          e.scheduleItems.forEach((item) => {
            const _data = {
              start: item.start.dateTime,
              end: item.end.dateTime,
            };
            _event[e.scheduleId].busy.push(_data);
          });
        });
        resolve({
          status: true,
          data: _event,
        });
      })
      .catch((error) => {
        console.log('error', error);
        resolve({
          status: false,
          err: error,
        });
      });
  });
};

const create = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  let event_id;
  let recurrence_id;
  let service_type;

  if (currentUser.calendar_connected) {
    let _appointment = req.body;
    const { connected_email, calendar_id } = req.body;
    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    if (_appointment.isZoomMeet) {
      const duration =
        (moment(_appointment.due_end).toDate().getTime() -
          moment(_appointment.due_start).toDate().getTime()) /
        (60 * 60 * 1000);
      const meetingReq = {
        user: currentUser.id,
        start_time: _appointment.due_start,
        timezone: _appointment.timezone,
        topic: _appointment.title,
        agenda: _appointment.description,
        duration,
      };
      await createUserMeeting(meetingReq)
        .then((_meeting) => {
          if (_meeting) {
            req.body.location = _meeting.join_url;
            _appointment = req.body;
          }
        })
        .catch(async (err) => {
          return res.status(400).json({
            status: false,
            error: err,
          });
        });
    }

    if (calendar.connected_calendar_type === 'outlook') {
      const data = {
        source: currentUser.source,
        appointment: _appointment,
        calendar,
        calendar_id,
      };
      try {
        const { new_event_id, new_recurrence_id } =
          await addOutlookCalendarById(data);
        event_id = new_event_id;
        recurrence_id = new_recurrence_id;
        service_type = 'outlook';
      } catch (err) {
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      }
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      const notification = true;
      const data = {
        source: currentUser.source,
        refresh_token: token.refresh_token,
        appointment: _appointment,
        calendar_id,
        notification,
      };
      try {
        const { new_event_id, new_recurrence_id } = await addGoogleCalendarById(
          data
        );
        event_id = new_event_id;
        recurrence_id = new_recurrence_id;
        service_type = 'google';
      } catch (err) {
        return res.status(400).send({
          status: false,
          error: err.message,
        });
      }
    }

    if (req.body.contacts) {
      const contacts = req.body.contacts;

      let outlookTime = {};
      if (service_type === 'outlook') {
        const { due_end, due_start, timezone } = req.body;
        const due_start_time = moment.tz(due_start, timezone).toDate();
        const due_end_time = moment.tz(due_end, timezone).toDate();
        outlookTime = {
          due_start: due_start_time,
          due_end: due_end_time,
        };
      }
      const appointment = new Appointment({
        ...req.body,
        contacts,
        user: currentUser.id,
        type: 0,
        event_id,
        recurrence_id,
        service_type,
        ...outlookTime,
      });

      appointment.save().catch((err) => {
        console.log('appointment save err', err.message);
      });
      let activity_content = 'added meeting';
      if (req.guest_loggin) {
        activity_content = ActivityHelper.assistantLog(
          activity_content,
          req.guest.name
        );
      }
      for (let i = 0; i < contacts.length; i++) {
        const activity = new Activity({
          content: activity_content,
          contacts: contacts[i],
          appointments: appointment.id,
          user: currentUser.id,
          type: 'appointments',
        });

        activity.save().then((_activity) => {
          Contact.updateOne(
            {
              _id: contacts[i],
            },
            {
              $set: { last_activity: _activity.id },
            }
          ).catch((err) => {
            console.log('err', err);
          });
        });
      }
    }
    return res.send({
      status: true,
      event_id,
    });
  } else {
    return res.status(427).json({
      status: false,
      error: 'You must connect gmail/outlook',
    });
  }
};

const edit = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  if (currentUser.calendar_connected) {
    const { recurrence_id, connected_email, calendar_id, guests, originEvent } =
      req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    let edit_data = req.body;
    const event_id = recurrence_id || req.params.id;
    if (edit_data.isZoomMeet) {
      const duration =
        (moment(edit_data.due_end).toDate().getTime() -
          moment(edit_data.due_start).toDate().getTime()) /
        (60 * 60 * 1000);
      const meetingReq = {
        user: currentUser.id,
        start_time: edit_data.due_start,
        timezone: edit_data.timezone,
        topic: edit_data.title,
        agenda: edit_data.description,
        duration,
      };
      await createUserMeeting(meetingReq)
        .then((_meeting) => {
          if (_meeting) {
            req.body.location = _meeting.join_url;
            edit_data = req.body;
          }
        })
        .catch((err) => {
          return res.status(400).json({
            status: false,
            error: err,
          });
        });
    }
    if (calendar.connected_calendar_type === 'outlook') {
      if (edit_data.recurring_type === 'follow') {
        const newEndTime = await moment(edit_data.due_start)
          .subtract(1, 'days')
          .format('YYYY-MM-DDTHH:mm:ss');
        const _data = {
          source: currentUser.source,
          appointment: originEvent,
          calendar,
          calendar_id,
          newEndTime,
        };
        await addOutlookCalendarById(_data);
        const data = {
          event_id,
          appointment: edit_data,
          calendar,
          source: currentUser.source,
        };
        await updateOutlookCalendarById(data);
      } else {
        const data = {
          event_id,
          appointment: edit_data,
          calendar,
          source: currentUser.source,
        };
        await updateOutlookCalendarById(data);
      }
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      if (edit_data.recurring_type === 'follow') {
        const newEndTime =
          moment(edit_data.due_start)
            .subtract(1, 'days')
            .format('YYYYMMDDTHHmmss') + 'Z';
        const notification = false;
        const isAfter = moment(edit_data.originalStartTime).isAfter(
          originEvent.originalStartTime
        );
        if (isAfter) {
          const data = {
            source: currentUser.source,
            refresh_token: token.refresh_token,
            appointment: originEvent,
            calendar_id,
            newEndTime,
            notification,
          };
          await addGoogleCalendarById(data);
        }
        const data = {
          source: currentUser.source,
          refresh_token: token.refresh_token,
          event_id,
          appointment: edit_data,
          calendar_id,
        };
        updateGoogleCalendarById(data);
      } else {
        const data = {
          source: currentUser.source,
          refresh_token: token.refresh_token,
          event_id,
          appointment: edit_data,
          calendar_id,
        };
        await updateGoogleCalendarById(data);
      }
    }

    if (edit_data.contacts && edit_data.contacts.length > 0) {
      const appointment = await Appointment.findOne({
        user: currentUser.id,
        event_id: req.params.id,
      }).catch((err) => {
        console.log('appointment find err', err.message);
      });

      if (appointment) {
        let outlookTime = {};
        if (req.body.service_type === 'outlook') {
          const { due_end, due_start, timezone } = req.body;
          const due_start_time = moment.tz(due_start, timezone).toDate();
          const due_end_time = moment.tz(due_end, timezone).toDate();
          outlookTime = {
            due_start: due_start_time,
            due_end: due_end_time,
          };
        }
        Appointment.updateOne(
          {
            _id: appointment.id,
          },
          {
            $set: {
              ...req.body,
              ...outlookTime,
            },
          }
        ).catch((err) => {
          console.log('appointment update err', err.message);
        });

        const contacts = appointment.contacts;

        for (let i = 0; i < edit_data.contacts.length; i++) {
          const contact = edit_data.contacts[i];
          if (contacts && contacts.indexOf(contact) !== -1) {
            const activity = new Activity({
              content: 'updated meeting',
              contacts: contact,
              appointments: appointment._id,
              user: currentUser.id,
              type: 'appointments',
            });

            contacts.splice(contacts.indexOf(contact), 1);

            activity
              .save()
              .then((_activity) => {
                Contact.updateOne(
                  { _id: contact },
                  {
                    $set: { last_activity: _activity.id },
                  }
                ).catch((err) => {
                  console.log('err', err);
                });
              })
              .catch((err) => {
                console.log('activity save err', err.message);
              });
          } else {
            const activity = new Activity({
              content: 'added meeting',
              contacts: contact,
              appointments: appointment.id,
              user: currentUser.id,
              type: 'appointments',
            });

            activity.save().then((_activity) => {
              Contact.updateOne(
                {
                  _id: contact,
                },
                {
                  $set: { last_activity: _activity.id },
                }
              ).catch((err) => {
                console.log('err', err);
              });
            });
          }
        }

        if (contacts && contacts.length > 0) {
          Activity.deleteMany({
            contacts: { $in: contacts },
            appointments: appointment._id,
            type: 'appointments',
          }).catch((err) => {
            console.log('activity remove err', err.message);
          });
        }
      }
      return res.send({
        status: true,
      });
    } else {
      return res.send({
        status: true,
      });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Invalid calendar',
    });
  }
};

const remove = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  if (currentUser.calendar_connected) {
    const { event_id, recurrence_id, calendar_id, connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const remove_id = recurrence_id || event_id;
    if (calendar.connected_calendar_type === 'outlook') {
      const data = {
        calendar_id,
        calendar,
        remove_id,
        source: currentUser.source,
      };
      await removeOutlookCalendarById(data).catch((err) => {
        console.log('outlook calendar event remove err', err.message);
        return res.status(400).json({
          status: false,
          error: err,
        });
      });
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      const data = {
        source: currentUser.source,
        refresh_token: token.refresh_token,
        calendar_id,
        remove_id,
      };
      await removeGoogleCalendarById(data).catch((err) => {
        console.log('google calendar event remove err', err.message);
        return res.status(400).json({
          status: false,
          error: err,
        });
      });
    }

    // remove activity
    const appointment = await Appointment.findOne({
      user: currentUser.id,
      event_id,
    }).catch((err) => {
      console.log('remove appointment find err', err.message);
    });

    if (appointment) {
      Activity.deleteMany({
        appointments: appointment.id,
        user: currentUser.id,
      }).catch((err) => {
        console.log('appointment activity remove', err.message);
      });

      Appointment.deleteOne({
        user: currentUser.id,
        event_id,
      }).catch((err) => {
        console.log('appointment update err', err.message);
      });
    }

    return res.send({
      status: true,
    });
  } else {
    return res.status(400).json({
      status: false,
      error: 'Appointment remove error',
    });
  }
};

const removeContact = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const {
    event_id,
    recurrence_id,
    calendar_id,
    connected_email,
    contact_id,
    contact_email,
  } = req.body;

  const calendar_list = currentUser.calendar_list;
  let calendar;
  calendar_list.some((_calendar) => {
    if (_calendar.connected_email === connected_email) {
      calendar = _calendar;
      return true;
    }
  });

  const edit_id = recurrence_id || event_id;
  if (calendar) {
    if (calendar.connected_calendar_type === 'outlook') {
      let accessToken;
      const token = msClient.createToken({
        refresh_token: calendar.outlook_refresh_token,
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
          return res.status(427).send({
            status: false,
            error: 'not connected',
          });
        });

      const client = graph.Client.init({
        // Use the provided access token to authenticate
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const event_object = await getOutlookEventById({
        calendar_id,
        // ctz: system_settings.TIME_ZONE,
        calendar_event_id: edit_id,
        calendar,
        source: currentUser.source,
      }).catch((_) => {
        console.log('outlook_event_getting', _);
      });
      if (event_object) {
        // Remove attendee (contact email) from guests
        const attendees = event_object.attendees || [];
        for (let i = attendees.length - 1; i >= 0; i--) {
          const attendee = attendees[i];
          const email = attendee.emailAddress.address;
          if (email === contact_email) {
            attendees.splice(i, 1);
            break;
          }
        }
        const payload = {
          attendees,
        };
        await client
          .api(`/me/calendars/${calendar_id}/events/${edit_id}`)
          .update(payload)
          .catch((err) => {
            console.log('remove err', err);
          });
      }
      console.log('event_object', event_object);
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });
      const data = { googleClient, calendar_id, calendar_event_id: edit_id };
      const event_object = await getGoogleEventById(data).catch((err) => {});
      if (event_object) {
        const calendar = google.calendar({
          version: 'v3',
          auth: googleClient,
        });
        // event object finding
        const attendees = event_object.attendees || [];
        const new_attendees = [];
        for (let i = attendees.length - 1; i >= 0; i--) {
          const attendee = attendees[i];
          const email = attendee.email;
          if (email !== contact_email) {
            new_attendees.push({
              email,
            });
          }
        }
        const payload = {
          attendees: new_attendees,
        };
        const params = {
          calendarId: calendar_id,
          eventId: edit_id,
          sendNotifications: true,
          resource: payload,
        };
        await calendar.events.patch(params, function (err) {
          console.log('google calendar update', err);
        });
      }
    }
  }

  // remove activity
  const appointment = await Appointment.findOne({
    user: currentUser.id,
    event_id: edit_id,
  }).catch((err) => {
    console.log('remove appointment find err', err.message);
  });

  if (appointment) {
    const current_contact_ids = appointment.contacts || [];
    const new_contacts = current_contact_ids.filter(
      (e) => e + '' !== contact_id
    );
    if (new_contacts.length) {
      Appointment.updateOne(
        {
          user: currentUser.id,
          event_id: edit_id,
        },
        {
          $pull: {
            contacts: { $in: [contact_id] },
            guests: { $in: [contact_email] },
          },
        }
      ).catch((err) => {
        console.log('remove appointment find err', err.message);
      });
      Activity.deleteMany({
        appointments: appointment._id,
        user: currentUser.id,
        contacts: contact_id,
      }).catch((err) => {
        console.log('appointment activity remove', err.message);
      });
    } else {
      Appointment.deleteOne({
        user: currentUser.id,
        event_id: edit_id,
      }).catch(() => {
        console.log('empty appointment removing failed');
      });
      Activity.deleteMany({
        user: currentUser.id,
        appointments: appointment._id,
      }).catch(() => {
        console.log('empty appointment activity removing failed');
      });
    }
  }

  return res.send({
    status: true,
  });
};

const accept = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  if (currentUser.calendar_connected) {
    const { recurrence_id, connected_email, calendar_id } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const event_id = recurrence_id || req.body.event_id;

    if (calendar.connected_calendar_type === 'outlook') {
      let accessToken;
      const token = msClient.createToken({
        refresh_token: calendar.outlook_refresh_token,
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
          return res.status(427).send({
            status: false,
            error: 'not connected',
          });
        });

      const client = graph.Client.init({
        // Use the provided access token to authenticate
        // requests
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const accept = {
        sendResponse: true,
      };
      client
        .api(`/me/calendars/${calendar_id}/events/${event_id}/accept`)
        .post(accept)
        .then(async () => {
          if (req.body.organizer) {
            const contact = await Contact.findOne({
              user: currentUser.id,
              email: req.body.organizer,
            });

            if (contact) {
              const appointment = new Appointment({
                contact: contact._id,
                user: currentUser.id,
                type: 1,
                event_id,
              });

              appointment.save().catch((err) => {
                console.log('appointment save err', err.message);
              });

              const activity = new Activity({
                content: 'accepted appointment',
                contacts: contact._id,
                appointments: appointment.id,
                user: currentUser.id,
                type: 'appointments',
              });

              activity
                .save()
                .then((_activity) => {
                  Contact.updateOne(
                    {
                      _id: contact._id,
                    },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                })
                .catch((err) => {
                  console.log('appointment save err', err.message);
                  return res.status(500).send({
                    status: false,
                    error: err.message,
                  });
                });
            }
          }

          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });
    } else if (calendar.connected_calendar_type === 'google') {
      const token = JSON.parse(calendar.google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });

      const client = google.calendar({ version: 'v3', auth: googleClient });

      const event = {
        attendees: [
          {
            email: calendar.connected_email,
            responseStatus: 'accepted',
          },
        ],
      };

      const params = {
        calendarId: calendar_id,
        eventId: event_id,
        resource: event,
        sendNotifications: true,
      };

      client.events.patch(params, async (err) => {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service: ${err}`
          );
          return res.status(400).json({
            status: false,
            error: err,
          });
        } else {
          console.log('calendar update');

          if (req.body.organizer) {
            const contact = await Contact.findOne({
              user: currentUser.id,
              email: req.body.organizer,
            });

            if (contact) {
              const appointment = new Appointment({
                contact: contact._id,
                user: currentUser.id,
                type: 1,
                event_id,
              });

              appointment.save().catch((err) => {
                console.log('appointment save err', err.message);
              });

              const activity = new Activity({
                content: 'accepted appointment',
                contacts: contact._id,
                appointments: appointment.id,
                user: currentUser.id,
                type: 'appointments',
              });

              activity
                .save()
                .then((_activity) => {
                  Contact.updateOne(
                    {
                      _id: contact._id,
                    },
                    {
                      $set: { last_activity: _activity.id },
                    }
                  ).catch((err) => {
                    console.log('err', err);
                  });
                })
                .catch((err) => {
                  console.log('appointment save err', err.message);
                  return res.status(500).send({
                    status: false,
                    error: err.message,
                  });
                });
            }
          }

          return res.send({
            status: true,
          });
        }
      });
    }
  }
};

const decline = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  if (currentUser.calendar_connected) {
    const { recurrence_id, connected_email, calendar_id } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const event_id = recurrence_id || req.body.event_id;

    if (calendar.connected_calendar_type === 'outlook') {
      let accessToken;
      const token = msClient.createToken({
        refresh_token: calendar.outlook_refresh_token,
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
          return res.status(427).send({
            status: false,
            error: 'not connected',
          });
        });

      const client = graph.Client.init({
        // Use the provided access token to authenticate
        // requests
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      const decline = {
        sendResponse: true,
      };
      client
        .api(`/me/calendars/${calendar_id}/events/${event_id}/decline`)
        .post(decline)
        .then(() => {
          return res.send({
            status: true,
          });
        })
        .catch((err) => {
          return res.status(400).json({
            status: false,
            error: err.message,
          });
        });
    } else if (calendar.connected_calendar_type === 'google') {
      const token = JSON.parse(calendar.google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });

      const client = google.calendar({ version: 'v3', auth: googleClient });

      const event = {
        attendees: [
          {
            email: calendar.connected_email,
            responseStatus: 'declined',
          },
        ],
      };

      const params = {
        calendarId: calendar_id,
        eventId: event_id,
        resource: event,
        sendNotifications: true,
      };

      client.events.patch(params, function (err) {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service: ${err}`
          );
          return res.status(400).json({
            status: false,
            error: err,
          });
        } else {
          return res.send({
            status: true,
          });
        }
      });
    }
  }
};

const getCalendarList = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const calendar_list = currentUser.calendar_list;
  if (!calendar_list.length) {
    return res.status(427).send({
      status: false,
      error: 'You must connect google/outlook calendar',
    });
  }
  const result = await getAllCalendars(currentUser, calendar_list);
  if (result?.data && result.data.length) {
    return res.send(result);
  } else {
    return res.status(427).send({
      status: false,
      error: 'You must connect google/outlook calendar',
    });
  }
};

const getEventById = async (req, res) => {
  const { currentUser } = req;
  await checkIdentityTokens(currentUser);
  const { googleClient } = getOauthClients(currentUser.source);
  if (currentUser.calendar_connected) {
    const { event_id, recurrence_id, calendar_id, connected_email } = req.body;

    const calendar_list = currentUser.calendar_list;
    let calendar;
    calendar_list.some((_calendar) => {
      if (_calendar.connected_email === connected_email) {
        calendar = _calendar;
        return true;
      }
    });

    if (!calendar) {
      return res.status(400).json({
        status: false,
        error: 'Invalid calendar',
      });
    }

    const calendar_event_id = recurrence_id || event_id;
    if (calendar.connected_calendar_type === 'outlook') {
      await getOutlookEventById({
        calendar_id,
        // ctz,
        calendar_event_id,
        calendar,
        source: currentUser.source,
      })
        .then(async (event) => {
          const guests = [];

          if (event.attendees && event.attendees.length > 0) {
            const attendees = event.attendees;
            for (let i = 0; i < attendees.length; i++) {
              const guest = attendees[i].emailAddress.address;
              let response = '';
              switch (attendees[i].status.response) {
                case 'none':
                  response = 'needsAction';
                  break;
                case 'organizer':
                  response = 'accepted';
                  break;
                case 'declined':
                  response = 'declined';
                  break;
                case 'accepted':
                  response = 'accepted';
                  break;
                case 'tentativelyAccepted':
                  response = 'tentative';
                  break;
                case 'notResponded':
                  response = 'needsAction';
                  break;
                default:
                  response = 'needsAction';
                  break;
              }
              guests.push({ email: guest, response });
            }
          }
          const _outlook_calendar_data = {
            service_type: 'outlook',
          };
          _outlook_calendar_data.title = event.subject;
          if (event.body) {
            _outlook_calendar_data.description = event.body.content;
          } else {
            _outlook_calendar_data.description = '';
          }
          if (event.location) {
            _outlook_calendar_data.location = event.location.displayName;
          } else {
            _outlook_calendar_data.location = '';
          }
          _outlook_calendar_data.timezone =
            event.originalStartTimeZone || event.originalEndTimeZone;
          if (event.start) {
            _outlook_calendar_data.due_start = event.start.dateTime;
          } else {
            _outlook_calendar_data.due_start = '';
          }
          if (event.end) {
            _outlook_calendar_data.due_end = event.end.dateTime;
          } else {
            _outlook_calendar_data.due_end = '';
          }
          if (event.organizer) {
            if (event.isOrganizer) {
              _outlook_calendar_data.is_organizer = true;
              _outlook_calendar_data.organizer = connected_email;
            } else {
              _outlook_calendar_data.organizer =
                event.organizer.emailAddress.address;
            }
          }
          if (event.recurrence) {
            if (
              event.recurrence.pattern &&
              event.recurrence.pattern.type.indexOf('daily') !== -1
            ) {
              _outlook_calendar_data.recurrence = 'DAILY';
            } else if (
              event.recurrence.pattern &&
              event.recurrence.pattern.type.indexOf('weekly') !== -1
            ) {
              _outlook_calendar_data.recurrence = 'WEEKLY';
            } else if (
              event.recurrence.pattern &&
              event.recurrence.pattern.type.indexOf('Monthly') !== -1
            ) {
              _outlook_calendar_data.recurrence = 'MONTHLY';
            } else if (
              event.recurrence.pattern &&
              event.recurrence.pattern.type.indexOf('absoluteYearly') !== -1
            ) {
              _outlook_calendar_data.recurrence = 'YEARLY';
            }
          }

          _outlook_calendar_data.calendar_id = calendar_id;
          _outlook_calendar_data.guests = guests;
          _outlook_calendar_data.event_id = event.id;

          return res.send({
            status: true,
            data: _outlook_calendar_data,
          });
        })
        .catch((err) => {
          console.log('event getting err', err.message);
          return res.status(400).json({
            status: false,
            error: err,
          });
        });
    } else {
      const token = JSON.parse(calendar.google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });
      const data = { googleClient, calendar_id, calendar_event_id };
      await getGoogleEventById(data)
        .then((event) => {
          const guests = [];

          if (event.attendees) {
            for (let j = 0; j < event.attendees.length; j++) {
              const guest = event.attendees[j].email;
              const response = event.attendees[j].responseStatus;
              guests.push({ email: guest, response });
            }
          }
          const _gmail_calendar_data = {};
          _gmail_calendar_data.title = event.summary;
          _gmail_calendar_data.description = event.description;
          _gmail_calendar_data.location = event.location;
          _gmail_calendar_data.due_start =
            event.start.dateTime || event.start.date;
          _gmail_calendar_data.due_end = event.end.dateTime || event.end.date;
          _gmail_calendar_data.guests = guests;
          _gmail_calendar_data.timezone =
            event.start.timeZone || event.end.timeZone;

          if (event.organizer) {
            _gmail_calendar_data.organizer = event.organizer.email;
            if (event.organizer.email === calendar_id) {
              _gmail_calendar_data.is_organizer = true;
            }
          }

          if (event.recurrence) {
            if (event.recurrence[0].indexOf('DAILY') !== -1) {
              _gmail_calendar_data.recurrence = 'DAILY';
            } else if (event.recurrence[0].indexOf('WEEKLY') !== -1) {
              _gmail_calendar_data.recurrence = 'WEEKLY';
            } else if (event.recurrence[0].indexOf('MONTHLY') !== -1) {
              _gmail_calendar_data.recurrence = 'MONTHLY';
            } else if (event.recurrence[0].indexOf('YEARLY') !== -1) {
              _gmail_calendar_data.recurrence = 'YEARLY';
            }
          }

          _gmail_calendar_data.calendar_id = calendar_id;
          _gmail_calendar_data.event_id = event.id;

          return res.send({
            status: true,
            data: _gmail_calendar_data,
          });
        })
        .catch((err) => {
          console.log('event getting err', err.message);
          return res.status(500).json({
            status: false,
            error: err.message,
          });
        });
    }
  } else {
    return res.status(400).json({
      status: false,
      error: 'Appointment remove error',
    });
  }
};

const getCalendarListByUser = async (user_id) => {
  const currentUser = await User.findOne({ _id: user_id });
  await checkIdentityTokens(currentUser);
  const { msClient, googleClient } = getOauthClients(currentUser.source);
  const { calendar_list } = currentUser;
  const promise_array = [];
  const data = [];

  for (let i = 0; i < calendar_list.length; i++) {
    const { connected_calendar_type } = calendar_list[i];
    if (connected_calendar_type === 'outlook') {
      let accessToken;
      const { connected_email, outlook_refresh_token, version } =
        calendar_list[i];
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
          new Promise((resolve, reject) => {
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

      const outlook_calendar = new Promise((resolve) => {
        client
          .api('/me/calendars')
          .header()
          .get()
          .then(async (outlook_calendars) => {
            const calendars = outlook_calendars.value;
            if (calendars.length > 0) {
              for (let i = 0; i < calendars.length; i++) {
                if (calendars[i].canEdit) {
                  data.push({
                    email: connected_email,
                    calendar_id: calendars[i].id,
                  });
                }
              }
              resolve();
            } else {
              resolve();
            }
          })
          .catch((_) => {
            console.log('calendar_list_getting', _);
            resolve();
          });
      });

      promise_array.push(outlook_calendar);
    } else {
      const { google_refresh_token, connected_email } = calendar_list[i];
      const token = JSON.parse(google_refresh_token);
      googleClient.setCredentials({ refresh_token: token.refresh_token });

      const client = google.calendar({ version: 'v3', auth: googleClient });
      const google_calendar = new Promise((resolve) => {
        client.calendarList.list(
          {
            maxResults: 2500,
          },
          function (err, result) {
            if (err) {
              console.log(
                `The API returned an error4: ${err} ${connected_email}`
              );
              return resolve({
                status: false,
                error: connected_email,
              });
            }

            const calendars = result.data.items;
            if (calendars) {
              for (let i = 0; i < calendars.length; i++) {
                if (calendars[i].accessRole === 'owner') {
                  data.push({
                    email: connected_email,
                    calendar_id: calendars[i].id,
                  });
                }
              }
              resolve();
            }
          }
        );
      });
      promise_array.push(google_calendar);
    }
  }

  return new Promise((resolve) => {
    Promise.all(promise_array)
      .then(() => {
        return resolve({
          status: true,
          data,
        });
      })
      .catch((err) => {
        console.log('get calendar err', err);
        return resolve({
          status: false,
          error: err,
        });
      });
  });
};

const getAppointments = async (req, res) => {
  const { currentUser } = req;
  const { contactId, skip, limit } = req.body;
  await checkIdentityTokens(currentUser);
  const { googleClient } = getOauthClients(currentUser.source);
  if (currentUser.calendar_connected) {
    const appointments = await Appointment.find({
      user: currentUser._id,
      contacts: contactId,
      del: false,
    })
      .skip(skip)
      .limit(limit);
    const calendar_list = currentUser.calendar_list;
    const calendarData = await getAllCalendars(currentUser, calendar_list);
    if (calendarData.status) {
      const calendarListDic = {};
      calendar_list.forEach((e) => {
        const dicKey = e.connected_calendar_type + '-' + e.connected_email;
        calendarListDic[dicKey] = e;
      });

      const subCalendarListDic = {};
      calendarData.data.forEach((c) => {
        const subCalendars = c.data || [];
        const calendarAccountEmail = c.email;
        subCalendars.forEach((e) => {
          const dicKey = e.id;
          const matchedCalendarInfoKey =
            e.service_type + '-' + calendarAccountEmail;
          subCalendarListDic[dicKey] = {
            ...e,
            ...(calendarListDic[matchedCalendarInfoKey] || {}),
          };
        });
      });
      const data = [];
      for (let i = 0; i < appointments.length; i++) {
        const appointment = appointments[i]._doc;
        // get event information
        const calendar = subCalendarListDic[appointment.calendar_id];
        const calendar_id = appointment.calendar_id;
        const calendar_event_id = appointment.event_id;
        if (!calendar) {
          data.push(appointment);
        } else {
          if (appointment.service_type === 'google') {
            const token = JSON.parse(calendar.google_refresh_token);
            googleClient.setCredentials({ refresh_token: token.refresh_token });
            const c_data = { googleClient, calendar_id, calendar_event_id };
            await getGoogleEventById(c_data)
              .then((event) => {
                appointment.meeting_url = event.hangoutLink
                  ? event.hangoutLink
                  : '';
                data.push(appointment);
              })
              .catch((err) => {
                console.log('event getting err', err.message);
              });
          } else {
            // const event_object = await getOutlookEventById({
            //   calendar_id,
            //   calendar_event_id,
            //   calendar,
            //   source: currentUser.source,
            // }).catch((_) => {
            //   console.log('outlook_event_getting', _);
            // });
            if ((appointment.location || '').startsWith('http')) {
              appointment.meeting_url = appointment.location;
            }
            data.push(appointment);
          }
        }
      }
      return res.send({
        status: true,
        data,
      });
    } else {
      return res.send(calendarData);
    }
  } else {
    return res.send({
      status: false,
      error: 'Please connect calendar',
    });
  }
};

const getOutlookEventById = async (data) => {
  const {
    calendar_id,
    // ctz,
    calendar_event_id: outlook_event_id,
    calendar,
    source,
  } = data;
  const { msClient } = getOauthClients(source);
  let accessToken;
  const token = msClient.createToken({
    refresh_token: calendar.outlook_refresh_token,
    expires_in: 0,
  });

  return new Promise(async (resolve, reject) => {
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
        reject(error);
      });

    const client = graph.Client.init({
      // Use the provided access token to authenticate
      // requests
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    const event = await client
      .api(`/me/calendars/${calendar_id}/events/${outlook_event_id}`)
      // .header('Prefer', `outlook.timezone="${ctz}"`)
      .get()
      .catch((err) => {
        console.log('remove err', err);
      });
    resolve(event);
  });
};

const getGoogleEventById = async (data) => {
  const { googleClient, calendar_id, calendar_event_id } = data;
  const calendar = google.calendar({ version: 'v3', auth: googleClient });
  const params = {
    calendarId: calendar_id,
    eventId: calendar_event_id,
  };

  return new Promise((resolve, reject) => {
    calendar.events.get(params, {}, function (err, response) {
      if (err) {
        console.log(
          `There was an error contacting the Calendar service11: ${err}`
        );
        reject(err);
      } else {
        resolve(response.data);
      }
    });
  });
};

module.exports = {
  getAll,
  getCalendarList,
  getCalendarListByUser,
  create,
  edit,
  remove,
  removeContact,
  accept,
  decline,
  getEventById,
  googleCalendarList,
  outlookCalendarList,
  googleCalendarFreeBusyList,
  outlookCalendarFreeBusyList,
  getAppointments,
};
