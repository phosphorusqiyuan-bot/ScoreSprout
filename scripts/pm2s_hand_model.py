"""PM2S hand-part network, adapted from cheriell/PM2S (MIT).

Only the hand-part architecture and its four input features are needed here.
The official pretrained weights are downloaded separately from Zenodo.
Copyright (c) 2022 Lele Liu. See third_party/PM2S-LICENSE.
"""

import torch
from torch import nn
from torch.nn import functional as F


class HandPartModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.convs = nn.Sequential(
            nn.Conv2d(1, 128, kernel_size=(9, 531), padding=(4, 0)),
            nn.BatchNorm2d(128), nn.ELU(), nn.Dropout(0.15),
            nn.Conv2d(128, 256, kernel_size=(9, 1), padding=(4, 0)),
            nn.BatchNorm2d(256), nn.ELU(), nn.Dropout(0.15),
            nn.Conv2d(256, 512, kernel_size=(9, 1), padding=(4, 0)),
            nn.BatchNorm2d(512), nn.ELU(), nn.Dropout(0.15),
        )
        self.grus_beat = nn.GRU(512, 512, num_layers=2, batch_first=True,
                                dropout=0.15, bidirectional=True)
        self.linear = nn.Linear(1024, 512)
        self.out_linear = nn.Linear(512, 1)

    def forward(self, notes):
        pitch = F.one_hot(notes[:, :, 0].long(), 128).float()
        onset = notes[:, :, 1]
        delta = torch.cat((torch.zeros_like(onset[:, :1]), onset[:, 1:] - onset[:, :-1]), dim=1)
        delta = F.one_hot(torch.round(torch.clamp(delta, 0, 4) / 0.01).long(), 401).float()
        duration = notes[:, :, 2:3].float()
        velocity = notes[:, :, 3:4].float() / 127.0
        features = torch.cat((pitch, delta, duration, velocity), dim=2)
        x = self.convs(features.unsqueeze(1)).squeeze(3).transpose(1, 2)
        x, _ = self.grus_beat(x)
        return torch.sigmoid(self.out_linear(self.linear(x)).squeeze(-1))


def load_model(weight_path):
    model = HandPartModel()
    state = torch.load(weight_path, map_location="cpu", weights_only=True)
    # Names match the official RNNHandPartModel state_dict.
    renamed = {}
    for key, value in state.items():
        key = key.replace("convs.conv.", "convs.")
        key = key.replace("gru.grus_beat.", "grus_beat.")
        key = key.replace("gru.linear.", "linear.")
        key = key.replace("out.linear.", "out_linear.")
        renamed[key] = value
    model.load_state_dict(renamed, strict=True)
    model.eval()
    return model
