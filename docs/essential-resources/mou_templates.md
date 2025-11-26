# MoU templates
## What are MoU templates useful for?
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

To support World Bank task teams and others in formalizing data access modalities, **MoU templates** were produced under the GDF-MPD project and cover the essential aspects described above. Three templates were developed, coinciding with three distinct configurations of data sharing modalities (also called "data pipeline models"). The templates are available in English and French and can be [downloaded at the bottom of this page](#download-templates). Details on the characteristics of each of the three models are provided below.

```{warning} Adjust MoU templates to country context
MoU templates accomodate archetypal data pipeline architectures but are only intended to provide a general structure with key content and were not designed as one-size-fits-all tools. They should always be adjusted to country specific needs and context. Particular attention should be paid to aligning the MoU with the relevant regulatory framework. 
```

## The three main data pipeline models
### Definition of three data tiers

- 🔴**Tier I "nano" data**: raw data records of the form `<user ID , timestamp , antenna ID>`.
- 🔴**Tier I "micro" data**: device-level summary measures of Tier I “nano” data for a specified  time period.
- 🟠**Tier II data**: summary measure of Tier I data (from a given MNO) aggregated at the level of spatial units for a specified time period.
- 🟢**Tier III data**: statistics on a well-defined target population, derived from the combination of Tier II data (possibly from multiple MNOs) and non-MNO data (e.g. census, household surveys).

### MNO-centric model (*model A*)

::::{grid}
:gutter: 2

:::{grid-item-card} Roles assignment in MNO-centric Model
:columns: 12

| Role | Actor |
| :--- | :--- |
| **Data Custodian** - Stores & manages data | MNO |
| **Data Controller** - Decides data usage | NSO / Gov Agencies |
| **Data Processor** - Develops methods & scripts | MNO / NSO |
| **Data Processor** - Runs scripts | MNO |
:::
::::

```{figure} /docs/images/modelA.png
---
name: modelA
width: 90%
align: center
alt: Schematic figure showing the architecture of data pipeline model A
---
**Schematic illustration of the architecture of data pipeline model A.**
```

### Regulator-centric model (*model B*)

::::{grid}
:gutter: 2

:::{grid-item-card} Roles assignment in Regulator-centric Model
:columns: 12

| Role | Actor |
| :--- | :--- |
| **Data Custodian** - Stores & manages data | Regulator |
| **Data Controller** - Decides data usage | NSO / Gov Agencies |
| **Data Processor** - Develops methods & scripts | NSO |
| **Data Processor** - Runs scripts | NSO |
:::
::::

```{figure} /docs/images/modelB.png
---
name: modelB
width: 90%
align: center
alt: Schematic figure showing the architecture of data pipeline model B
---
**Schematic illustration of the architecture of data pipeline model B.**
```

### Hybrid model (*model AB*)

::::{grid}
:gutter: 2

:::{grid-item-card} Roles assignment in Hybrid Model
:columns: 12

| Role | Actor |
| :--- | :--- |
| **Data Custodian** - Stores & manages data | MNO |
| **Data Controller** - Decides data usage | NSO / Gov Agencies |
| **Data Processor** - Develops methods & scripts | NSO |
| **Data Processor** - Runs scripts | NSO |
:::
::::

```{figure} /docs/images/modelAB_1.png
---
name: modelAB_1
width: 90%
align: center
alt: Schematic figure showing the architecture of data pipeline model AB
---
**Schematic illustration of the architecture of data pipeline model AB.**
```

(download-templates)=
## Download MoU templates

[MoU template - model A (English)](MoU_template_WorldBank_modelA_EN.docx)
