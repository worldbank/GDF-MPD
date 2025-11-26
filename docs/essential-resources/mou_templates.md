# MoU templates

The integration of Mobile Network Operator (MNO) data into national data systems is a complex process, which first requires securing data access and agreeing on overarching principles of collaboration between key stakeholders such as MNOs, National Statistical Offices (NSO), Regulatory Authorities (RA), Data Protection Authorities (DPA), and others. This critical milestone is usually achieved through the signing of a **Memorandum of Understanding** (MoU). 

Although the scope and content of an MoU may vary across contexts, it is desirable that it covers at least the following 5 key pillars:
- 🤝**Roles and Responsibilities**: which stakeholder is responsible for what?
- 🔄**Data Sharing Protocols**: what data is shared, and how?
- 🔑**Data Access Protocols**: who can access the data, and how?
- ✅**Permitted Data Use and Dissemination**: what is the intended data use, what indicators are permitted and how are results disseminated?
- 🛡️**Data Safeguards**: how are data security and privacy ensured throughout the data pipeline?

```{seealso}
[GPSDD - A Roadmap to Accessing Mobile Network Data for Statistics](https://www.data4sdgs.org/roadmap-accessing-mobile-network-data-statistics)
```

To support World Bank task teams and others in formalizing data access modalities, **MoU templates** were produced under the GDF-MPD project and cover the essential aspects described above. Three templates were developed, coinciding with three distinct configurations of data sharing modalities (also called "data pipeline models")
- **MNO-centric model** (*model A*)
```{note}
Who stores and manages data (Data Custodian)? $\rightarrow$ MNO
Who decides what data are used for (Data Controller)? $\rightarrow$ NSO and/or other government agencies
Who develops methods and scripts (Data Processor)? $\rightarrow$ MNO and/or NSO
Who executes scripts and produces results (Data Processor bis)? $\rightarrow$ MNO
```

::::{grid}
:gutter: 2

:::{grid-item-card} 🏢 MNO-centric Model (Model A)
:columns: 12

| Role | Actor |
| :--- | :--- |
| **Data Custodian** (Stores data) | MNO |
| **Data Controller** (Decides usage) | NSO / Gov Agencies |
| **Data Processor** (Develops scripts) | MNO / NSO |
| **Execution** (Runs scripts) | MNO |
:::
::::

```{figure} ./docs/images/modelA.png
---
name: modelA
width: 80%
align: center
alt: Schematic figure showing the architecture of data pipeline model A
---
**Schematic illustration of the architecture of data pipeline model A.**
You can write a longer description here, and it will appear nicely formatted below the image.
```
