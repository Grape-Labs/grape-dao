import { grapeLinks } from "@/lib/grape";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  Typography
} from "@mui/material";

export default function NotFound() {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 8 } }}>
      <Card
        className="fx-enter fx-shell fx-glow"
        sx={{
          borderRadius: 2.5,
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(145deg, rgba(11, 20, 28, 0.98), rgba(7, 12, 18, 0.98))"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 8% 0%, rgba(120, 183, 255, 0.28), transparent 36%), radial-gradient(circle at 92% 10%, rgba(86, 242, 179, 0.24), transparent 40%)"
          }}
        />
        <CardContent sx={{ p: { xs: 2.5, md: 4 }, position: "relative", zIndex: 1 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.2}>
              <Typography variant="overline" color="primary.light">
                Grape Hub | grape.art
              </Typography>
              <Chip variant="outlined" color="secondary" label="Route Not Found" />
            </Stack>

            <Typography
              sx={{
                fontSize: { xs: "3.8rem", md: "6.2rem" },
                lineHeight: 0.95,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                background:
                  "linear-gradient(95deg, #9dffd7 0%, #78b7ff 52%, #9dffd7 100%)",
                backgroundClip: "text",
                color: "transparent"
              }}
            >
              404
            </Typography>

            <Typography variant="h2" sx={{ fontSize: { xs: "1.5rem", md: "2rem" } }}>
              This path does not exist.
            </Typography>

            <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
              The page you requested could not be found. Use one of the routes
              below to continue to Grape Hub, access Identity, or connect with
              the DAO.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" color="primary" href="/">
                Back to Hub
              </Button>
              <Button variant="outlined" color="primary" href="/identity">
                Open Identity
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                href={grapeLinks.docs}
                target="_blank"
                rel="noreferrer"
              >
                Read Docs
              </Button>
              <Button
                variant="text"
                color="secondary"
                href={grapeLinks.discord}
                target="_blank"
                rel="noreferrer"
              >
                DAO Discord
              </Button>
            </Stack>

            <Box
              className="fx-wave"
              aria-hidden="true"
              sx={{ width: { xs: "100%", md: 280 }, mt: 0.4 }}
            >
              <svg viewBox="0 0 200 24" preserveAspectRatio="none">
                <path
                  className="secondary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
                <path
                  className="primary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
              </svg>
              <svg viewBox="0 0 200 24" preserveAspectRatio="none">
                <path
                  className="secondary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
                <path
                  className="primary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
              </svg>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
