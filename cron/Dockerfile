FROM alpine:3.20
RUN apk add --no-cache curl
COPY invoke.sh /invoke.sh
RUN chmod +x /invoke.sh
CMD ["/invoke.sh"]
