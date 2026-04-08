#!/bin/bash
# Martani Deploy Script
# Usage: ./start.sh [env] [target]
#   env:    test | prod | all
#   target: backend | frontend | celery | build | all (default: all)
#
# Examples:
#   ./start.sh prod backend    # prod 백엔드만 재시작
#   ./start.sh test frontend   # test 프론트엔드만 재빌드+재시작
#   ./start.sh prod all        # prod 전체 재시작
#   ./start.sh all             # test+prod 전체 재시작
#   ./start.sh prod logs       # prod 로그 보기
#   ./start.sh prod status     # prod 컨테이너 상태 확인

set -e
cd "$(dirname "$0")"

ENV="${1:-all}"
TARGET="${2:-all}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

compose_cmd() {
  local env="$1"
  shift
  docker compose -p "martani-${env}" \
    -f docker-compose.yml \
    -f "docker-compose.${env}.yml" \
    --env-file ".env.${env}" \
    "$@"
}

deploy_backend() {
  local env="$1"
  local build_flag=""
  if [ "${BUILD:-}" = "1" ]; then
    build_flag="--build"
    echo -e "${CYAN}[$env]${NC} Backend 이미지 빌드+재시작..."
  else
    echo -e "${CYAN}[$env]${NC} Backend 재시작..."
  fi
  compose_cmd "$env" up -d --force-recreate $build_flag backend
  echo -e "${GREEN}[$env]${NC} Backend 완료"
}

deploy_frontend() {
  local env="$1"
  local build_flag=""
  if [ "${BUILD:-}" = "1" ]; then
    build_flag="--build"
    echo -e "${CYAN}[$env]${NC} Frontend 이미지 빌드+재시작..."
  else
    echo -e "${CYAN}[$env]${NC} Frontend 재시작..."
  fi
  compose_cmd "$env" up -d --force-recreate $build_flag frontend
  echo -e "${YELLOW}[$env]${NC} Frontend 빌드 중... (로그: ./start.sh $env logs frontend)"
  # Wait for build completion (prod only, max 3 minutes)
  if [ "$env" = "prod" ]; then
    local timeout=180
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
      if docker logs "martani-${env}-frontend" 2>&1 | grep -q "Ready in"; then
        echo -e "${GREEN}[$env]${NC} Frontend 빌드+시작 완료"
        return 0
      fi
      if docker logs "martani-${env}-frontend" 2>&1 | grep -q "Failed to compile"; then
        echo -e "${RED}[$env]${NC} Frontend 빌드 실패!"
        docker logs "martani-${env}-frontend" 2>&1 | grep -A5 "error"
        return 1
      fi
      sleep 5
      elapsed=$((elapsed + 5))
      echo -ne "\r${YELLOW}[$env]${NC} 빌드 대기 중... ${elapsed}s"
    done
    echo ""
    echo -e "${RED}[$env]${NC} Frontend 빌드 타임아웃 (${timeout}s)"
    return 1
  else
    # test uses dev mode, starts quickly
    sleep 5
    echo -e "${GREEN}[$env]${NC} Frontend (dev mode) 시작 완료"
  fi
}

deploy_celery() {
  local env="$1"
  local workers=""
  # Check which celery services exist
  if compose_cmd "$env" ps --format "{{.Name}}" 2>/dev/null | grep -q "celery-worker"; then
    workers="celery-worker"
  fi
  if compose_cmd "$env" ps --format "{{.Name}}" 2>/dev/null | grep -q "celery-gpu"; then
    workers="$workers celery-gpu-worker"
  fi
  if [ -z "$workers" ]; then
    echo -e "${YELLOW}[$env]${NC} Celery worker 없음, 건너뜀"
    return 0
  fi
  local build_flag=""
  if [ "${BUILD:-}" = "1" ]; then
    build_flag="--build"
    echo -e "${CYAN}[$env]${NC} Celery 이미지 빌드+재시작: $workers"
  else
    echo -e "${CYAN}[$env]${NC} Celery 재시작: $workers"
  fi
  compose_cmd "$env" up -d --force-recreate $build_flag $workers
  echo -e "${GREEN}[$env]${NC} Celery 완료"
}

show_status() {
  local env="$1"
  echo -e "${CYAN}[$env]${NC} 컨테이너 상태:"
  compose_cmd "$env" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
}

show_logs() {
  local env="$1"
  local service="${2:-}"
  if [ -n "$service" ]; then
    docker logs "martani-${env}-${service}" --tail 50 -f
  else
    compose_cmd "$env" logs --tail 30 -f
  fi
}

deploy_all() {
  local env="$1"
  echo -e "${CYAN}=== $env 환경 전체 배포 ===${NC}"
  deploy_backend "$env"
  deploy_frontend "$env"
  deploy_celery "$env"
  echo ""
  show_status "$env"
  echo -e "${GREEN}=== $env 배포 완료 ===${NC}"
  echo ""
}

run_for_env() {
  local env="$1"
  local target="$2"

  case "$target" in
    backend)  deploy_backend "$env" ;;
    frontend) deploy_frontend "$env" ;;
    celery)   deploy_celery "$env" ;;
    build)    BUILD=1 deploy_all "$env" ;;
    status)   show_status "$env" ;;
    logs)     show_logs "$env" "$3" ;;
    all)      deploy_all "$env" ;;
    *)
      echo -e "${RED}알 수 없는 타겟: $target${NC}"
      echo "사용 가능: backend | frontend | celery | build | status | logs | all"
      exit 1
      ;;
  esac
}

# Main
case "$ENV" in
  test|prod)
    run_for_env "$ENV" "$TARGET" "$3"
    ;;
  all)
    run_for_env "test" "$TARGET" "$3"
    run_for_env "prod" "$TARGET" "$3"
    ;;
  status)
    show_status "test"
    echo ""
    show_status "prod"
    ;;
  *)
    echo -e "${YELLOW}Martani Deploy Script${NC}"
    echo ""
    echo "사용법: ./start.sh [env] [target]"
    echo ""
    echo "  env:    test | prod | all"
    echo "  target: backend | frontend | celery | build | status | logs | all"
    echo ""
    echo "예시:"
    echo "  ./start.sh prod backend     # prod 백엔드 재시작"
    echo "  ./start.sh test frontend    # test 프론트엔드 재빌드"
    echo "  ./start.sh prod build       # prod 전체 이미지 빌드+배포"
    echo "  ./start.sh prod all         # prod 전체 재시작 (빌드 없이)"
    echo "  ./start.sh all              # test+prod 전체 재시작"
    echo "  ./start.sh status           # test+prod 상태 확인"
    echo "  ./start.sh prod logs        # prod 전체 로그"
    echo "  ./start.sh prod logs frontend  # prod 프론트 로그"
    exit 0
    ;;
esac
