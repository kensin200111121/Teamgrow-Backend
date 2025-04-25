const { google } = require('googleapis');
const graph = require('@microsoft/microsoft-graph-client');
const { getOauthClients } = require('./user');
const randomstring = require('randomstring');
const moment = require('moment-timezone');
const { days } = require('../constants/variable');

const getAllCalendars = async (currentUser, calendar_list) => {
  const promise_array = [];
  const data = [];
  const { msClient, googleClient } = getOauthClients(currentUser.source);
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

      const outlook_calendar = new Promise((resolve) => {
        client
          .api('/me/calendars')
          .header()
          .get()
          .then(async (outlook_calendars) => {
            const calendars = outlook_calendars.value;
            if (calendars.length > 0) {
              const calendar = {
                email: connected_email,
                data: [],
              };
              for (let i = 0; i < calendars.length; i++) {
                if (calendars[i].canEdit) {
                  calendar.data.push({
                    id: calendars[i].id,
                    title: calendars[i].name,
                    color:
                      calendars[i].hexColor === ''
                        ? undefined
                        : calendars[i].hexColor,
                    service_type: 'outlook',
                  });
                }
              }
              data.push(calendar);
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
              console.log(`The API returned an error3: ${err}`);
              return resolve({
                status: false,
                error: connected_email,
              });
            }

            const calendars = result.data.items;
            if (calendars) {
              const calendar = {
                email: connected_email,
                data: [],
              };

              for (let i = 0; i < calendars.length; i++) {
                if (calendars[i].accessRole === 'owner') {
                  const calendar_data = {
                    id: calendars[i].id,
                    title: calendars[i].summary,
                    time_zone: calendars[i].timeZone,
                    color: calendars[i].backgroundColor,
                    service_type: 'google',
                  };
                  calendar.data.push(calendar_data);
                }
              }
              data.push(calendar);
              resolve();
            }
          }
        );
      });

      promise_array.push(google_calendar);
    }
  }
  try {
    await Promise.all(promise_array);
    return {
      status: true,
      data,
    };
  } catch (error) {
    console.log('get calendar err', error);
    return {
      status: false,
      error,
    };
  }
};

const addGoogleCalendarById = async (data) => {
  const {
    source,
    refresh_token,
    appointment,
    calendar_id,
    newEndTime = '',
    notification,
  } = data;
  const { googleClient } = getOauthClients(source);
  googleClient.setCredentials({ refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: googleClient });
  const attendees = [];
  if (appointment.guests) {
    for (let j = 0; j < appointment.guests.length; j++) {
      const addendee = {
        email: appointment.guests[j],
      };
      attendees.push(addendee);
    }
  }
  let recurrence;
  if (appointment.recurrence) {
    if (newEndTime) {
      recurrence = [`RRULE:FREQ=${appointment.recurrence};UNTIL=${newEndTime}`];
    } else {
      recurrence = [`RRULE:FREQ=${appointment.recurrence};`];
    }
  }

  let conferenceData;
  if (appointment.isGoogleMeet) {
    const string = randomstring.generate({
      length: 10,
      charset: '1234567890ABCDEFHJKMNPQSTUVWXYZ',
    });
    conferenceData = {
      createRequest: {
        requestId: string,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  let starTime = '';
  let endTime = '';
  let event;

  if (appointment.is_full) {
    if (newEndTime) {
      starTime = moment(appointment.originalStartTime).format('YYYY-MM-DD');
      endTime = moment(appointment.originalEndTime)
        .add(1, 'days')
        .format('YYYY-MM-DD');
    } else {
      starTime = moment(appointment.due_start).format('YYYY-MM-DD');
      endTime = moment(appointment.due_end).add(1, 'days').format('YYYY-MM-DD');
    }
    event = {
      summary: appointment.title,
      location: appointment.location,
      description: appointment.description,
      start: {
        date: starTime,
        timeZone: appointment.timezone,
      },
      end: {
        date: endTime,
        timeZone: appointment.timezone,
      },
      conferenceData,
      attendees,
      recurrence,
    };
  } else {
    if (newEndTime) {
      event = {
        summary: appointment.title,
        location: appointment.location,
        description: appointment.description,
        start: {
          dateTime: appointment.originalStartTime,
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: appointment.originalEndTime,
          timeZone: appointment.timezone,
        },
        conferenceData,
        attendees,
        recurrence,
      };
    } else {
      event = {
        summary: appointment.title,
        location: appointment.location,
        description: appointment.description,
        start: {
          dateTime: appointment.due_start,
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: appointment.due_end,
          timeZone: appointment.timezone,
        },
        conferenceData,
        attendees,
        recurrence,
      };
    }
  }

  return new Promise((resolve, reject) => {
    calendar.events.insert(
      {
        auth: googleClient,
        calendarId: calendar_id,
        sendNotifications: notification,
        resource: event,
        conferenceDataVersion: 1,
      },
      function (err, event) {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service: ${err}`
          );
          return reject(err);
        }

        resolve({
          meeting_url: event.data.hangoutLink ? event.data.hangoutLink : '',
          new_event_id: event.data.id,
          new_recurrence_id: event.data.id,
        });
      }
    );
  });
};

const addOutlookCalendarById = async (data) => {
  const { source, appointment, calendar, calendar_id, newEndTime } = data;
  const attendees = [];
  if (appointment.guests) {
    for (let j = 0; j < appointment.guests.length; j++) {
      let addendee;
      if (typeof appointment.guests[j] === 'object') {
        addendee = {
          emailAddress: {
            Address: appointment.guests[j].email,
          },
        };
      } else {
        addendee = {
          emailAddress: {
            Address: appointment.guests[j],
          },
        };
      }
      attendees.push(addendee);
    }
  }

  let recurrence;
  if (appointment.recurrence) {
    let type;
    let daysOfWeek;
    let dayOfMonth;
    let month;
    switch (appointment.recurrence) {
      case 'DAILY':
        type = 'daily';
        break;
      case 'WEEKLY':
        type = 'weekly';
        daysOfWeek = [days[moment(appointment.due_start).day()]];
        break;
      case 'MONTHLY':
        type = 'absoluteMonthly';
        dayOfMonth = moment(appointment.due_start).date();
        break;
      case 'YEARLY':
        type = 'absoluteYearly';
        dayOfMonth = moment(appointment.due_start).date();
        month = moment(appointment.due_start).month() + 1;
        break;
      default:
        console.log('no matching');
    }

    if (newEndTime) {
      recurrence = {
        pattern: {
          type,
          interval: 1,
          daysOfWeek,
          dayOfMonth,
          month,
        },
        range: {
          type: 'endDate',
          startDate: moment(appointment.originalStartTime).format('YYYY-MM-DD'),
          endDate: moment(newEndTime).format('YYYY-MM-DD'),
        },
      };
    } else {
      recurrence = {
        pattern: {
          type,
          interval: 1,
          daysOfWeek,
          dayOfMonth,
          month,
        },
        range: {
          type: 'noEnd',
          startDate: moment(appointment.due_start).format('YYYY-MM-DD'),
        },
      };
    }
  }

  let starTime = '';
  let endTime = '';
  let newEvent;
  if (appointment.is_full) {
    if (newEndTime) {
      starTime = moment(appointment.originalStartTime).format('YYYY-MM-DD');
      endTime = moment(appointment.originalEndTime)
        .add(1, 'days')
        .format('YYYY-MM-DD');
    } else {
      starTime = moment(appointment.due_start).format('YYYY-MM-DD');
      endTime = moment(appointment.due_end).add(1, 'days').format('YYYY-MM-DD');
    }
    newEvent = {
      subject: appointment.title,
      body: {
        contentType: 'HTML',
        content: appointment.description,
      },
      location: {
        displayName: appointment.location,
      },
      start: {
        dateTime: starTime,
        timeZone: appointment.timezone,
      },
      end: {
        dateTime: endTime,
        timeZone: appointment.timezone,
      },
      isAllDay: appointment.is_full,
      attendees,
      recurrence,
    };
  } else {
    if (newEndTime) {
      newEvent = {
        subject: appointment.title,
        body: {
          contentType: 'HTML',
          content: appointment.description,
        },
        location: {
          displayName: appointment.location,
        },
        start: {
          dateTime: appointment.originalStartTime,
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: appointment.originalEndTime,
          timeZone: appointment.timezone,
        },
        attendees,
        recurrence,
      };
    } else {
      newEvent = {
        subject: appointment.title,
        body: {
          contentType: 'HTML',
          content: appointment.description,
        },
        location: {
          displayName: appointment.location,
        },
        start: {
          dateTime: appointment.due_start,
          timeZone: appointment.timezone,
        },
        end: {
          dateTime: appointment.due_end,
          timeZone: appointment.timezone,
        },
        attendees,
        recurrence,
        isReminderOn: false,
      };
    }
  }

  return new Promise(async (resolve, reject) => {
    let accessToken;
    const { msClient } = getOauthClients(source);
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
        reject(error);
      });

    const client = graph.Client.init({
      // Use the provided access token to authenticate
      // requests
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    await client
      .api(`/me/calendars/${calendar_id}/events`)
      .header('Prefer', `outlook.timezone="${newEvent.start.timezone}"`)
      .post(newEvent)
      .then((_res) => {
        resolve({
          new_event_id: _res.id,
          new_recurrence_id: _res.id,
        });
      })
      .catch((err) => {
        console.log('error', err);
      });
  });
};

const updateGoogleCalendarById = async (data) => {
  const { source, refresh_token, event_id, appointment, calendar_id } = data;
  const { googleClient } = getOauthClients(source);
  googleClient.setCredentials({ refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: googleClient });
  const attendees = [];
  if (appointment.guests) {
    for (let j = 0; j < appointment.guests.length; j++) {
      const addendee = {
        email: appointment.guests[j],
      };
      attendees.push(addendee);
    }
  }
  let conferenceData;
  if (appointment.isGoogleMeet) {
    if (!appointment.hangoutLink) {
      const string = randomstring.generate({
        length: 10,
        charset: '1234567890ABCDEFHJKMNPQSTUVWXYZ',
      });
      conferenceData = {
        createRequest: {
          requestId: string,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }
  } else {
    conferenceData = null;
  }
  let event;
  if (
    appointment.recurring_type === 'follow' ||
    appointment.recurring_type === 'all' ||
    !appointment.recurrence_id
  ) {
    if (appointment.isGoogleMeet) {
      event = {
        summary: appointment.title,
        location: appointment.location,
        description: appointment.description,
        start: {
          date: null,
          dateTime: appointment.due_start,
          timeZone: appointment.timezone,
        },
        end: {
          date: null,
          dateTime: appointment.due_end,
          timeZone: appointment.timezone,
        },
        conferenceData,
        attendees,
      };
    } else {
      if (appointment.hangoutLink) {
        event = {
          summary: appointment.title,
          location: appointment.location,
          description: appointment.description,
          start: {
            date: null,
            dateTime: appointment.due_start,
            timeZone: appointment.timezone,
          },
          end: {
            date: null,
            dateTime: appointment.due_end,
            timeZone: appointment.timezone,
          },
          hangoutLink: null,
          conferenceData: null,
          attendees,
        };
      } else {
        event = {
          summary: appointment.title,
          location: appointment.location,
          description: appointment.description,
          start: {
            date: null,
            dateTime: appointment.due_start,
            timeZone: appointment.timezone,
          },
          end: {
            date: null,
            dateTime: appointment.due_end,
            timeZone: appointment.timezone,
          },
          attendees,
        };
      }
    }
  } else {
    if (appointment.isGoogleMeet) {
      event = {
        summary: appointment.title,
        location: appointment.location,
        description: appointment.description,
        start: {
          date: null,
          dateTime: appointment.due_start,
          timeZone: appointment.timezone,
        },
        end: {
          date: null,
          dateTime: appointment.due_end,
          timeZone: appointment.timezone,
        },
        recurringEventId: appointment.recurrence_id,
        conferenceData,
        attendees,
      };
    } else {
      if (appointment.hangoutLink) {
        event = {
          summary: appointment.title,
          location: appointment.location,
          description: appointment.description,
          start: {
            date: null,
            dateTime: appointment.due_start,
            timeZone: appointment.timezone,
          },
          end: {
            date: null,
            dateTime: appointment.due_end,
            timeZone: appointment.timezone,
          },
          recurringEventId: appointment.recurrence_id,
          hangoutLink: null,
          conferenceData: null,
          attendees,
        };
      } else {
        event = {
          summary: appointment.title,
          location: appointment.location,
          description: appointment.description,
          start: {
            date: null,
            dateTime: appointment.due_start,
            timeZone: appointment.timezone,
          },
          end: {
            date: null,
            dateTime: appointment.due_end,
            timeZone: appointment.timezone,
          },
          recurringEventId: appointment.recurrence_id,
          attendees,
        };
      }
    }
  }
  if (appointment.is_full) {
    event['start']['date'] = moment(appointment.due_start).format('YYYY-MM-DD');
    event['end']['date'] = moment(appointment.due_start)
      .add(1, 'day')
      .format('YYYY-MM-DD');
    event['start']['dateTime'] = null;
    event['end']['dateTime'] = null;
  }
  if (appointment.recurrence) {
    if (appointment.until) {
      event['recurrence'] = [
        `RRULE:FREQ=${appointment.recurrence};UNTIL=${appointment.until}`,
      ];
    } else {
      event['recurrence'] = [`RRULE:FREQ=${appointment.recurrence};`];
      if (
        appointment.recurring_type !== 'follow' &&
        appointment.recurring_type !== 'all'
      ) {
        delete event['recurringEventId'];
      }
    }
  }
  const params = {
    calendarId: calendar_id,
    eventId: event_id,
    resource: event,
    sendNotifications: true,
    conferenceDataVersion: 1,
  };
  if (
    appointment.recurring_type === 'follow' ||
    appointment.recurring_type === 'all'
  ) {
    return new Promise((resolve, reject) => {
      calendar.events.update(params, function (err) {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service 1: ${err}`
          );
          reject(err);
        }
        resolve();
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      calendar.events.patch(params, function (err) {
        if (err) {
          console.log(
            `There was an error contacting the Calendar service 2: ${err}`
          );
          reject(err);
        }
        resolve();
      });
    });
  }
};

const updateOutlookCalendarById = async (data) => {
  const { appointment, event_id, calendar, onlyGuests, source } = data;
  const { msClient } = getOauthClients(source);
  const attendees = [];
  if (appointment.guests) {
    for (let j = 0; j < appointment.guests.length; j++) {
      const addendee = {
        emailAddress: {
          address: appointment.guests[j],
        },
      };
      attendees.push(addendee);
    }
  }

  let event;
  if (onlyGuests) {
    event = {
      attendees,
    };
  } else {
    let recurrence;
    if (appointment.recurrence) {
      let type;
      let daysOfWeek;
      let dayOfMonth;
      let month;
      switch (appointment.recurrence) {
        case 'DAILY':
          type = 'daily';
          break;
        case 'WEEKLY':
          type = 'weekly';
          daysOfWeek = [days[moment(appointment.due_start).day()]];
          break;
        case 'MONTHLY':
          type = 'absoluteMonthly';
          dayOfMonth = moment(appointment.due_start).date();
          break;
        case 'YEARLY':
          type = 'absoluteYearly';
          dayOfMonth = moment(appointment.due_start).date();
          month = moment(appointment.due_start).month() + 1;
          break;
        default:
          console.log('no matching');
      }

      recurrence = {
        pattern: {
          type,
          interval: 1,
          daysOfWeek,
          dayOfMonth,
          month,
        },
        range: {
          type: 'noEnd',
          startDate: moment(appointment.due_start).format('YYYY-MM-DD'),
        },
      };
    } else {
      recurrence = null;
    }

    event = {
      subject: appointment.title,
      body: {
        contentType: 'HTML',
        content: appointment.description,
      },
      location: {
        displayName: appointment.location,
      },
      start: {
        dateTime: appointment.due_start,
        timeZone: appointment.timezone,
      },
      end: {
        dateTime: appointment.due_end,
        timeZone: appointment.timezone,
      },
      attendees,
      recurrence,
    };
  }

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

    try {
      const res = client
        .api(`/me/calendars/${appointment.calendar_id}/events/${event_id}`)
        .header('Prefer', `outlook.timezone="${appointment.timezone}"`)
        .update(event);
      resolve(res.id);
    } catch (_) {
      console.log('calendar_event_getting', _);
    }
  });
};

const removeGoogleCalendarById = async (data) => {
  const { source, refresh_token, calendar_id, remove_id } = data;

  const { googleClient } = getOauthClients(source);

  googleClient.setCredentials({ refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: googleClient });

  const params = {
    calendarId: calendar_id,
    eventId: remove_id,
    sendNotifications: true,
  };
  // calendar.events.delete(params, function (err) {
  //   if (err) {
  //     console.log(`There was an error contacting the Calendar service: ${err}`);
  //   }
  // });
  return new Promise((resolve, reject) => {
    calendar.events.delete(params, function (err) {
      if (err) {
        console.log(
          `There was an error contacting the Calendar service: ${err}`
        );
        reject(err);
      }
      resolve();
    });
  });
};

const removeOutlookCalendarById = async (data) => {
  const { calendar_id, remove_id, calendar, source } = data;
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

    await client
      .api(`/me/calendars/${calendar_id}/events/${remove_id}`)
      .delete()
      .catch((err) => {
        console.log('remove err', err);
      });
    resolve();
  });
};

module.exports = {
  getAllCalendars,
  addGoogleCalendarById,
  addOutlookCalendarById,
  updateGoogleCalendarById,
  updateOutlookCalendarById,
  removeGoogleCalendarById,
  removeOutlookCalendarById,
};
