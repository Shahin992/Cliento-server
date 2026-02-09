"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = exports.sendResponse = void 0;
const sendResponse = (res, payload) => {
    return res.status(payload.statusCode).json(payload);
};
exports.sendResponse = sendResponse;
const sendError = (res, payload) => {
    return res.status(payload.statusCode).json(payload);
};
exports.sendError = sendError;
