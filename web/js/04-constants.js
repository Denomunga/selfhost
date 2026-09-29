"use strict";
/* Shared constants — vehicle feature catalogue and spare-part categories. */

const F = {
  awd:"Symmetrical All-Wheel Drive", turbo:"Turbocharged boxer engine", eye:"EyeSight driver assist",
  xmode:"X-Mode with hill descent", leather:"Leather upholstery", roof:"Sunroof",
  cam:"Reverse camera", cruise:"Adaptive cruise control", heat:"Heated front seats",
  key:"Keyless entry and push start", cp:"Apple CarPlay", aa:"Android Auto",
  rails:"Roof rails", led:"LED headlamps", paddle:"Paddle shifters", bi:"Bi-xenon projectors",
  diff:"Limited-slip differential", si:"SI-Drive modes", susp:"Sport-tuned suspension",
  tow:"Tow bar fitted", boot:"Powered tailgate", nav:"Factory navigation"
};

/** Categories offered when adding or editing a spare part. */
const PART_CATS = ["Filters","Brakes","Suspension","Engine","Electrical","Body & Trim","Fluids","Accessories"];
