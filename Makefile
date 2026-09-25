# RecruitSage v2 — one-command workflow.
# Windows without `make`? Run the underlying commands directly, e.g.
#   docker compose up -d --build   |   python scripts/verify.py

.PHONY: up down logs ps verify eval deploy

up:            ## build + start the whole stack
	docker compose up -d --build

down:          ## stop everything
	docker compose down

logs:          ## follow logs for all services
	docker compose logs -f

ps:            ## service status
	docker compose ps

verify:        ## end-to-end smoke test against the running stack
	python scripts/verify.py

eval:          ## run the eval suite (Phase E)
	python scripts/eval.py

deploy:        ## run whatever deploy steps can be automated (see DEPLOY.md)
	@echo "See DEPLOY.md for the manual account/key steps."
