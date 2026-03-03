"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statementsRouter = void 0;
const express_1 = require("express");
const statementsController_1 = require("@controllers/statementsController");
exports.statementsRouter = (0, express_1.Router)();
exports.statementsRouter.get("/:statementId/transactions", statementsController_1.listStatementTransactions);
