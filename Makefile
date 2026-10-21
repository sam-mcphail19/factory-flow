.DEFAULT_GOAL := help

ifeq ($(OS),Windows_NT)
SHELL := powershell.exe
.SHELLFLAGS := -NoProfile -Command
NPM := npm.cmd
else
NPM := npm
endif

.PHONY: help install dev build start check typecheck test lint format-check

help:
	@echo "Monifactory Planner commands:"
	@echo "  make install       Install dependencies"
	@echo "  make dev           Start the local app at http://localhost:3000"
	@echo "  make check         Run typecheck and the full test suite"
	@echo "  make typecheck     Check TypeScript"
	@echo "  make test          Run the full test suite"
	@echo "  make lint          Run ESLint"
	@echo "  make format-check  Check formatting"
	@echo "  make build         Build the production app"
	@echo "  make start         Run the production build"

install:
	$(NPM) install

dev:
	$(NPM) run dev

build:
	$(NPM) run build

start:
	$(NPM) run start

check: typecheck test

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) run test

lint:
	$(NPM) run lint

format-check:
	$(NPM) run format:check
