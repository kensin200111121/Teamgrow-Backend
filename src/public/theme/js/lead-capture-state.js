const lead_capture_regions = {
  US: [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'Florida',
    'Georgia',
    'Guam',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Palau',
    'Pennsylvania',
    'Puerto Rico',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
    'District of Columbia',
  ],
  CA: [
    'Alberta',
    'British Columbia',
    'Manitoba',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Nova Scotia',
    'Ontario',
    'Prince Edward Island',
    'Quebec',
    'Saskatchewan',
  ],
};

let regions = [];

function convertRegions() {
  regions = [];
  for (const [key, value] of Object.entries(lead_capture_regions)) {
    regions.push({ key: key, value: value });
  }
}

function get_state_info(selectObject) {
  convertRegions();
  let name = selectObject.name;
  let value = selectObject.value;
  if (name === 'country') {
    const COUNTRY_CODE = value;
    if ($('select[name="state"]')) {
      $('select[name="state"]').empty();
      $('select[name="state"]').append(new Option('None', ''));

      if (COUNTRY_CODE) {
        if ($('select[name="state"]')) {
          regions.map((country) => {
            if (country.key === COUNTRY_CODE) {
              for (let region of country.value) {
                $('select[name="state"]').append(new Option(region, region));
              }
            }
          });
        }
      } else {
        //for selection "None"
        regions.map((country) => {
          let optgroup = '<optgroup label="' + country.key + '">';
          $('select[name="state"]').append(optgroup);
          for (let region of country.value) {
            $('select[name="state"]').append(new Option(region, region));
          }
        });
      }
    }
  } else if (name === 'state') {
    let label = $('select[name="state"] :selected').parent().attr('label');
    if (label) {
      $('select[name="country"]').val(label);
    }
  }
}
