"use strict";
// Display metadata only. Payload route identifiers remain the symbol codes.
const FREIGHT_ROUTES = {
  "CS11!": { name: "China / East Asia → U.S. West Coast", benchmark: "FBX01" },
  "CS21!": { name: "U.S. West Coast → China / East Asia", benchmark: "FBX02" },
  "CS31!": { name: "China / East Asia → U.S. East Coast", benchmark: "FBX03" },
  "CS41!": { name: "China / East Asia → North Europe", benchmark: "FBX11" },
  "CS51!": { name: "North Europe → China / East Asia", benchmark: "FBX12" },
  "CS61!": { name: "China / East Asia → Mediterranean", benchmark: "FBX13" },
};
if (typeof module !== "undefined") module.exports = FREIGHT_ROUTES;
